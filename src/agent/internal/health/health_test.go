package health

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/sparrows/sparrow-agent/internal/metrics"
)

// TestServerEndpoints 校验 /metrics 与 /healthz。
func TestServerEndpoints(t *testing.T) {
	reg := metrics.New()
	reg.Set("sparrow_agent_core_alive", nil, 1)
	reg.Inc("sparrow_agent_heartbeat_total", map[string]string{"result": "success"})

	server := New("127.0.0.1:0", reg, func() State {
		return State{OK: true, Core: "alive", Panel: "connected", ConfigVersion: 42, AgentVersion: "1.0.0"}
	}, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("启动服务失败: %v", err)
	}
	defer func() {
		_ = server.Shutdown(nil)
	}()

	// 直接用 handler 测试，避免端口分配问题
	handler := server.srv.Handler

	req, err := http.NewRequest(http.MethodGet, "/metrics", nil)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	rec := &recorder{header: http.Header{}}
	handler.ServeHTTP(rec, req)
	if rec.status != http.StatusOK {
		t.Fatalf("/metrics 状态码不对: %d", rec.status)
	}
	if !strings.Contains(rec.body.String(), "sparrow_agent_core_alive 1") {
		t.Fatalf("/metrics 输出不对: %s", rec.body.String())
	}
	if !strings.Contains(rec.body.String(), `sparrow_agent_heartbeat_total{result="success"} 1`) {
		t.Fatalf("/metrics 标签输出不对: %s", rec.body.String())
	}

	req, err = http.NewRequest(http.MethodGet, "/healthz", nil)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	rec = &recorder{header: http.Header{}}
	handler.ServeHTTP(rec, req)
	if rec.status != http.StatusOK {
		t.Fatalf("/healthz 状态码不对: %d", rec.status)
	}
	var state State
	if err := json.Unmarshal([]byte(rec.body.String()), &state); err != nil {
		t.Fatalf("解析健康检查响应失败: %v", err)
	}
	if state.Core != "alive" || state.Panel != "connected" || state.ConfigVersion != 42 {
		t.Fatalf("健康检查内容不对: %+v", state)
	}
}

// TestHealthzUnhealthy 校验不健康时返回 503。
func TestHealthzUnhealthy(t *testing.T) {
	server := New("127.0.0.1:0", metrics.New(), func() State {
		return State{OK: false, Core: "dead", Panel: "disconnected"}
	}, nil)
	req, _ := http.NewRequest(http.MethodGet, "/healthz", nil)
	rec := &recorder{header: http.Header{}}
	server.srv.Handler.ServeHTTP(rec, req)
	if rec.status != http.StatusServiceUnavailable {
		t.Fatalf("状态码应为 503，实际 %d", rec.status)
	}
}

// TestListenAndServe 校验端口监听可用。
func TestListenAndServe(t *testing.T) {
	server := New("127.0.0.1:19099", metrics.New(), func() State { return State{OK: true} }, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("启动服务失败: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	resp, err := http.Get("http://127.0.0.1:19099/healthz")
	if err != nil {
		t.Fatalf("请求健康检查失败: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("状态码不对: %d", resp.StatusCode)
	}
	if !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("响应内容不对: %s", body)
	}
	_ = time.Now()
}

// recorder 是一个简易的 ResponseRecorder。
type recorder struct {
	header http.Header
	body   strings.Builder
	status int
}

// Header 返回响应头。
func (r *recorder) Header() http.Header { return r.header }

// Write 写入响应体（未显式设置状态码时默认为 200）。
func (r *recorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.body.Write(p)
}

// WriteHeader 写入状态码。
func (r *recorder) WriteHeader(status int) { r.status = status }
