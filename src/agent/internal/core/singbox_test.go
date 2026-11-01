package core

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sparrow/agent/internal/model"
)

/* ---------------- 测试替身 ---------------- */

type clashFixture struct {
	connections string
	traffic     string
}

func newClashServer(t *testing.T, initial clashFixture) (*httptest.Server, *atomic.Value) {
	t.Helper()

	var state atomic.Value
	state.Store(initial)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := state.Load().(clashFixture)
		switch r.URL.Path {
		case "/connections":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, current.connections)
		case "/traffic":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, current.traffic)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	return server, &state
}

func newTestSingBox(t *testing.T, baseURL string, users []model.ConfigUser) *singBox {
	t.Helper()

	box := newSingBox(Options{})
	box.SetUsers(users)
	box.mu.Lock()
	box.controller = baseURL
	box.mu.Unlock()
	return box
}

func statsByUID(stats []model.UserStat) map[int]model.UserStat {
	out := make(map[int]model.UserStat, len(stats))
	for _, stat := range stats {
		out[stat.UID] = stat
	}
	return out
}

/* ---------------- 注入 ---------------- */

func TestInjectSingBoxConfigAddsClashAPI(t *testing.T) {
	input := `{
	  "log": {"level": "debug", "timestamp": true},
	  "inbounds": [{"type": "vless", "tag": "in-1", "listen_port": 443,
	    "users": [{"name": "lily@example.com", "email": "lily@example.com", "uid": 479220}]}],
	  "outbounds": [{"type": "direct", "tag": "direct"}],
	  "route": {"final": "direct"}
	}`

	injected, users, controller, secret, err := injectSingBoxConfig([]byte(input))
	if err != nil {
		t.Fatalf("injectSingBoxConfig: %v", err)
	}
	if controller != defaultClashController {
		t.Fatalf("controller = %q, want %q", controller, defaultClashController)
	}
	if secret != "" {
		t.Fatalf("secret = %q, want 空", secret)
	}
	if uid := users["lily@example.com"]; uid != 479220 {
		t.Fatalf("配置里的 uid 未解析出来: %v", users)
	}

	var root map[string]any
	if err := json.Unmarshal(injected, &root); err != nil {
		t.Fatalf("注入结果不是合法 JSON: %v", err)
	}

	experimental, ok := root["experimental"].(map[string]any)
	if !ok {
		t.Fatalf("缺少 experimental: %s", injected)
	}
	clashAPI, ok := experimental["clash_api"].(map[string]any)
	if !ok {
		t.Fatalf("缺少 experimental.clash_api: %s", injected)
	}
	if got := clashAPI["external_controller"]; got != defaultClashController {
		t.Fatalf("external_controller = %v", got)
	}

	// 原有字段一个都不能丢/改。
	if logLevel := root["log"].(map[string]any)["level"]; logLevel != "debug" {
		t.Fatalf("log.level 被破坏: %v", logLevel)
	}
	inbounds := root["inbounds"].([]any)
	if len(inbounds) != 1 {
		t.Fatalf("inbounds 被破坏: %v", inbounds)
	}
	user := inbounds[0].(map[string]any)["users"].([]any)[0].(map[string]any)
	if uid, _ := jsonInt(user["uid"]); uid != 479220 {
		t.Fatalf("inbound 用户 uid 被破坏: %v", user["uid"])
	}
	if route := root["route"].(map[string]any); route["final"] != "direct" {
		t.Fatalf("route.final 被破坏: %v", route)
	}
}

func TestInjectSingBoxConfigKeepsExistingClashAPI(t *testing.T) {
	input := `{
	  "log": {"level": "info"},
	  "experimental": {
	    "clash_api": {"external_controller": "0.0.0.0:9999", "secret": "s3cret"},
	    "cache_file": {"enabled": true}
	  }
	}`

	injected, _, controller, secret, err := injectSingBoxConfig([]byte(input))
	if err != nil {
		t.Fatalf("injectSingBoxConfig: %v", err)
	}
	if controller != "0.0.0.0:9999" || secret != "s3cret" {
		t.Fatalf("已有 clash_api 被覆盖: controller=%q secret=%q", controller, secret)
	}

	var root map[string]any
	if err := json.Unmarshal(injected, &root); err != nil {
		t.Fatalf("注入结果不是合法 JSON: %v", err)
	}
	experimental := root["experimental"].(map[string]any)
	clashAPI := experimental["clash_api"].(map[string]any)
	if clashAPI["external_controller"] != "0.0.0.0:9999" {
		t.Fatalf("external_controller 被覆盖: %v", clashAPI["external_controller"])
	}
	if _, ok := experimental["cache_file"]; !ok {
		t.Fatalf("experimental 其它字段被丢掉: %v", experimental)
	}
}

/* ---------------- 统计 ---------------- */

func TestSingBoxStatsAggregatesConnections(t *testing.T) {
	server, _ := newClashServer(t, clashFixture{
		connections: `{
		  "uploadTotal": 112, "downloadTotal": 217,
		  "connections": [
		    {"id": "c1", "upload": 100, "download": 200, "metadata": {"user": "lily@example.com"}},
		    {"id": "c2", "upload": 7, "download": 9, "metadata": {"email": "bob@example.com"}},
		    {"id": "c3", "upload": 5, "download": 8, "metadata": {"user": "ghost@example.com"}},
		    {"id": "c4", "upload": 3, "download": 4, "metadata": {"network": "tcp"}}
		  ]
		}`,
	})

	box := newTestSingBox(t, server.URL, []model.ConfigUser{
		{Email: "lily@example.com", UID: 479220},
		{Email: "bob@example.com", UID: 111},
	})

	stats, err := box.Stats(context.Background())
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}

	byUID := statsByUID(stats)
	if len(byUID) != 2 {
		t.Fatalf("应只汇总出 2 个 uid，实际 %v", stats)
	}
	if got := byUID[479220]; got.Upload != 100 || got.Download != 200 {
		t.Fatalf("lily 统计错误: %+v", got)
	}
	if got := byUID[111]; got.Upload != 7 || got.Download != 9 {
		t.Fatalf("bob（metadata.email）统计错误: %+v", got)
	}
	if _, ok := byUID[0]; ok {
		t.Fatalf("未匹配上的用户不应记到 uid=0: %v", stats)
	}
}

func TestSingBoxStatsStaysMonotonicWhenConnectionCloses(t *testing.T) {
	server, state := newClashServer(t, clashFixture{
		connections: `{"connections": [
		  {"id": "c1", "upload": 100, "download": 200, "metadata": {"user": "lily@example.com"}},
		  {"id": "c2", "upload": 10, "download": 10, "metadata": {"user": "bob@example.com"}}
		]}`,
	})

	box := newTestSingBox(t, server.URL, []model.ConfigUser{
		{Email: "lily@example.com", UID: 479220},
		{Email: "bob@example.com", UID: 111},
	})

	if _, err := box.Stats(context.Background()); err != nil {
		t.Fatalf("Stats: %v", err)
	}

	// bob 的连接关闭：/connections 里只剩 lily，且 lily 又涨了 50/60。
	state.Store(clashFixture{
		connections: `{"connections": [
		  {"id": "c1", "upload": 150, "download": 260, "metadata": {"user": "lily@example.com"}}
		]}`,
	})

	stats, err := box.Stats(context.Background())
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	byUID := statsByUID(stats)
	if got := byUID[479220]; got.Upload != 150 || got.Download != 260 {
		t.Fatalf("lily 累计值错误: %+v", got)
	}
	if got := byUID[111]; got.Upload != 10 || got.Download != 10 {
		t.Fatalf("连接关闭后 bob 的累计值不应倒退: %+v", got)
	}
}

func TestSingBoxOnlineUsers(t *testing.T) {
	server, state := newClashServer(t, clashFixture{
		connections: `{"connections": [
		  {"id": "c1", "metadata": {"user": "lily@example.com"}},
		  {"id": "c2", "metadata": {"user": "lily@example.com"}},
		  {"id": "c3", "metadata": {"email": "bob@example.com"}}
		]}`,
	})

	box := newTestSingBox(t, server.URL, []model.ConfigUser{
		{Email: "lily@example.com", UID: 479220},
		{Email: "bob@example.com", UID: 111},
	})

	online, err := box.OnlineUsers(context.Background())
	if err != nil {
		t.Fatalf("OnlineUsers: %v", err)
	}
	if online != 2 {
		t.Fatalf("在线用户数应为去重后的 2，实际 %d", online)
	}

	// 内核不给用户标签时退回连接数。
	state.Store(clashFixture{
		connections: `{"connections": [
		  {"id": "c1", "metadata": {"network": "tcp"}},
		  {"id": "c2", "metadata": {"network": "udp"}}
		]}`,
	})
	if online, err = box.OnlineUsers(context.Background()); err != nil || online != 2 {
		t.Fatalf("无用户标签时应退回连接数: online=%d err=%v", online, err)
	}
}

func TestSingBoxStatsFallsBackToTraffic(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))

	server, state := newClashServer(t, clashFixture{
		connections: `{"connections": [
		  {"id": "c1", "upload": 100, "download": 100, "metadata": {"user": "lily@example.com"}},
		  {"id": "c2", "upload": 300, "download": 300, "metadata": {"user": "bob@example.com"}}
		]}`,
	})

	box := newSingBox(Options{Logger: logger})
	box.SetUsers([]model.ConfigUser{
		{Email: "lily@example.com", UID: 479220},
		{Email: "bob@example.com", UID: 111},
	})
	box.mu.Lock()
	box.controller = server.URL
	box.mu.Unlock()

	// 第一次：带用户信息，建立占比 lily 25% / bob 75%。
	if _, err := box.Stats(context.Background()); err != nil {
		t.Fatalf("Stats: %v", err)
	}

	// 之后内核不再给用户标签，只能按 /traffic 分摊。
	state.Store(clashFixture{
		connections: `{"connections": [{"id": "c9", "upload": 1, "download": 1, "metadata": {"network": "tcp"}}]}`,
		traffic:     `{"up": 1000, "down": 2000}`,
	})

	stats, err := box.Stats(context.Background())
	if err != nil {
		t.Fatalf("Stats fallback: %v", err)
	}
	byUID := statsByUID(stats)
	if got := byUID[479220]; got.Upload != 350 || got.Download != 600 {
		t.Fatalf("25%% 占比分摊错误: %+v", got)
	}
	if got := byUID[111]; got.Upload != 1050 || got.Download != 1800 {
		t.Fatalf("75%% 占比分摊错误: %+v", got)
	}

	if count := strings.Count(logs.String(), "精度受限"); count != 1 {
		t.Fatalf("精度告警应只出现一次，实际 %d 次:\n%s", count, logs.String())
	}

	// 再采一次：不应重复告警。
	if _, err := box.Stats(context.Background()); err != nil {
		t.Fatalf("Stats fallback: %v", err)
	}
	if count := strings.Count(logs.String(), "精度受限"); count != 1 {
		t.Fatalf("精度告警应只出现一次，实际 %d 次", count)
	}
}

func TestSingBoxStatsReturnsErrorOnBadResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	box := newSingBox(Options{})
	box.mu.Lock()
	box.controller = server.URL
	box.mu.Unlock()

	if _, err := box.Stats(context.Background()); err == nil {
		t.Fatal("HTTP 500 时应返回 error（由上层退避）")
	} else if !strings.Contains(err.Error(), "500") {
		t.Fatalf("错误信息应带状态码: %v", err)
	}
}

func TestClashBaseURL(t *testing.T) {
	cases := map[string]string{
		"":                        "http://127.0.0.1:9090",
		"127.0.0.1:9090":          "http://127.0.0.1:9090",
		"0.0.0.0:9090":            "http://127.0.0.1:9090",
		"[::]:9090":               "http://127.0.0.1:9090",
		"http://1.2.3.4:9090/":    "http://1.2.3.4:9090",
		"https://clash.local/api": "https://clash.local/api",
	}
	for input, want := range cases {
		if got := clashBaseURL(input); got != want {
			t.Fatalf("clashBaseURL(%q) = %q, want %q", input, got, want)
		}
	}
}

/* ---------------- Apply（假内核） ---------------- */

func TestSingBoxApplyInjectsClashAPI(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("假内核脚本依赖 POSIX shell")
	}

	dir := t.TempDir()
	binary := filepath.Join(dir, "fake-sing-box")
	script := "#!/bin/sh\n" +
		"case \"$1\" in\n" +
		"  version) echo 'sing-box version 1.12.0' ;;\n" +
		"  check) exit 0 ;;\n" +
		"  run) exec sleep 60 ;;\n" +
		"esac\n"
	if err := os.WriteFile(binary, []byte(script), 0o755); err != nil {
		t.Fatalf("写假内核: %v", err)
	}

	configPath := filepath.Join(dir, "core.json")
	box := newSingBox(Options{Binary: binary, ConfigPath: configPath, WorkDir: dir})
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = box.Stop(ctx)
	}()

	input := `{
	  "log": {"level": "debug", "timestamp": true},
	  "inbounds": [{"type": "vless", "tag": "in-1", "listen": "::", "listen_port": 443,
	    "users": [{"name": "lily@example.com", "email": "lily@example.com", "uid": 479220}]}],
	  "outbounds": [{"type": "direct", "tag": "direct"}],
	  "route": {"final": "direct"}
	}`
	if err := box.Apply(context.Background(), []byte(input)); err != nil {
		t.Fatalf("Apply: %v", err)
	}

	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("读取写入的配置: %v", err)
	}
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatalf("写入的配置不是合法 JSON: %v", err)
	}

	experimental := root["experimental"].(map[string]any)
	clashAPI := experimental["clash_api"].(map[string]any)
	if clashAPI["external_controller"] != defaultClashController {
		t.Fatalf("写入的配置缺少默认 clash_api: %v", clashAPI)
	}
	if root["log"].(map[string]any)["level"] != "debug" {
		t.Fatalf("原字段被破坏: %v", root["log"])
	}
	inbound := root["inbounds"].([]any)[0].(map[string]any)
	if inbound["tag"] != "in-1" || inbound["listen_port"] != float64(443) {
		t.Fatalf("inbound 被破坏: %v", inbound)
	}

	box.mu.Lock()
	controller := box.controller
	box.mu.Unlock()
	if controller != defaultClashController {
		t.Fatalf("Apply 后 controller = %q", controller)
	}
	if uid, ok := box.dir.uid("lily@example.com"); !ok || uid != 479220 {
		t.Fatalf("Apply 后未建立 email→uid 映射: uid=%d ok=%v", uid, ok)
	}
	if !box.Alive(context.Background()) {
		t.Fatal("假内核应已被拉起")
	}
}
