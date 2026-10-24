// Package health 提供 Agent 的本地可观测端点：/metrics 与 /healthz。
//
// 默认只监听 127.0.0.1:9090，不对外暴露。
package health

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/sparrows/sparrow-agent/internal/metrics"
)

// State 是 Agent 当前状态（用于 /healthz）。
type State struct {
	// OK 整体是否健康
	OK bool `json:"ok"`
	// Core 内核状态（alive / dead / unknown）
	Core string `json:"core"`
	// Panel 面板连接状态（connected / disconnected / unknown）
	Panel string `json:"panel"`
	// ConfigVersion 当前生效的配置版本
	ConfigVersion int64 `json:"configVersion"`
	// AgentVersion 当前 Agent 版本
	AgentVersion string `json:"agentVersion"`
	// Uptime 运行时长（秒）
	Uptime float64 `json:"uptime"`
}

// Server 是本地指标与健康检查服务。
type Server struct {
	srv      *http.Server
	registry *metrics.Registry
	state    func() State
	log      *slog.Logger
	started  time.Time
}

// New 创建本地可观测服务。
func New(addr string, registry *metrics.Registry, state func() State, log *slog.Logger) *Server {
	if log == nil {
		log = slog.Default()
	}
	s := &Server{
		registry: registry,
		state:    state,
		log:      log,
		started:  time.Now(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", s.handleMetrics)
	mux.HandleFunc("/healthz", s.handleHealthz)
	s.srv = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	return s
}

// ListenAndServe 启动服务（阻塞）。
func (s *Server) ListenAndServe() error {
	if err := s.srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("health: 本地指标服务异常退出: %w", err)
	}
	return nil
}

// Start 在后台启动服务。
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.srv.Addr)
	if err != nil {
		return fmt.Errorf("health: 监听 %s 失败: %w", s.srv.Addr, err)
	}
	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.log.Error("本地指标服务异常退出", "error", err.Error())
		}
	}()
	return nil
}

// Shutdown 优雅关闭服务。
func (s *Server) Shutdown(ctx context.Context) error {
	return s.srv.Shutdown(ctx)
}

// handleMetrics 输出 Prometheus 文本格式指标。
func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	if s.registry == nil {
		return
	}
	s.registry.Render(w)
}

// handleHealthz 输出健康状态。
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	state := State{OK: true, Core: "unknown", Panel: "unknown"}
	if s.state != nil {
		state = s.state()
	}
	state.Uptime = time.Since(s.started).Seconds()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if !state.OK {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	if err := json.NewEncoder(w).Encode(state); err != nil {
		s.log.Error("写入健康检查响应失败", "error", err.Error())
	}
}
