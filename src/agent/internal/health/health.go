// Package health 提供 doctor 自检与本地 /healthz、/metrics 端点。
package health

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	"sparrow/agent/internal/config"
	"sparrow/agent/internal/core"
)

type Check struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}

// Run 依次检查配置、内核二进制、内核运行、面板连通性。
func Run(ctx context.Context, cfg *config.Config) []Check {
	checks := []Check{}

	configErr := cfg.Validate()
	checks = append(checks, Check{Name: "config", OK: configErr == nil, Detail: firstNonEmpty(errString(configErr), cfg.Path())})

	kernel, err := core.New(cfg.Core.Type, core.Options{
		Binary:     cfg.Core.Binary,
		ConfigPath: cfg.Core.ConfigPath,
		WorkDir:    cfg.Agent.DataDir,
	})
	if err != nil {
		checks = append(checks, Check{Name: "core", OK: false, Detail: err.Error()})
	} else {
		version, verr := kernel.Version(ctx)
		checks = append(checks, Check{
			Name:   "core-binary",
			OK:     verr == nil,
			Detail: firstNonEmpty(version, errString(verr)),
		})
		checks = append(checks, Check{
			Name:   "core-running",
			OK:     kernel.Alive(ctx),
			Detail: cfg.Core.Binary,
		})
	}

	dialer := net.Dialer{Timeout: 5 * time.Second}
	conn, derr := dialer.DialContext(ctx, "tcp", hostPort(cfg.Panel.URL))
	if derr != nil {
		checks = append(checks, Check{Name: "panel", OK: false, Detail: derr.Error()})
	} else {
		_ = conn.Close()
		checks = append(checks, Check{Name: "panel", OK: true, Detail: cfg.Panel.URL})
	}

	return checks
}

// Serve 暴露本地 /healthz 与 /metrics（只监听 127.0.0.1）。
func Serve(ctx context.Context, addr string, probe func(context.Context) map[string]any) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "at": time.Now().UTC()})
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		state := probe(r.Context())
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		for key, value := range state {
			fmt.Fprintf(w, "sparrow_agent_%s %v\n", key, value)
		}
	})

	server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	return server.ListenAndServe()
}

func hostPort(raw string) string {
	trimmed := raw
	for _, prefix := range []string{"https://", "http://"} {
		if len(trimmed) > len(prefix) && trimmed[:len(prefix)] == prefix {
			trimmed = trimmed[len(prefix):]
		}
	}
	host := trimmed
	if idx := indexByte(trimmed, '/'); idx >= 0 {
		host = trimmed[:idx]
	}
	if hasPort(host) {
		return host
	}
	return host + ":443"
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func hasPort(host string) bool {
	for i := len(host) - 1; i >= 0; i-- {
		if host[i] == ':' {
			return true
		}
		if host[i] == ']' {
			return false
		}
	}
	return false
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
