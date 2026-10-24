package core

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newClashAPI 启动一个假的 Clash API 服务端。
func newClashAPI(t *testing.T, traffic string, connections string, reloadStatus int) (*httptest.Server, *int) {
	t.Helper()
	reloads := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
		reloads++
		if reloadStatus != 0 {
			w.WriteHeader(reloadStatus)
			_, _ = w.Write([]byte(`{"message":"reload failed"}`))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/traffic", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(traffic))
	})
	mux.HandleFunc("/connections", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(connections))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server, &reloads
}

// TestSingBoxApplyConfig 校验配置落盘、重载调用与本机参数注入。
func TestSingBoxApplyConfig(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "core.json")
	api, reloads := newClashAPI(t, `{"up":1,"down":2}`, `{"connections":[]}`, 0)

	impl, err := NewSingBox(Options{
		Type:       "sing-box",
		Binary:     "/bin/sh",
		ConfigPath: configPath,
		ClashAPI:   api.URL,
		Dir:        dir,
	})
	if err != nil {
		t.Fatalf("创建内核失败: %v", err)
	}
	singbox, ok := impl.(*SingBox)
	if !ok {
		t.Fatal("类型不对")
	}

	bundle := &Bundle{
		Version: 3,
		Core:    "sing-box",
		Config: map[string]any{
			"inbounds": []any{map[string]any{"type": "mixed", "tag": "in"}},
		},
		Certificates: []Certificate{{Name: "cert-a", Cert: "CERT", Key: "KEY"}},
		Reload:       true,
	}
	if err := singbox.ApplyConfig(context.Background(), bundle); err != nil {
		t.Fatalf("应用配置失败: %v", err)
	}
	if *reloads != 1 {
		t.Fatalf("应调用一次 reload，实际 %d", *reloads)
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("配置不是合法 JSON: %v", err)
	}
	experimental, ok := decoded["experimental"].(map[string]any)
	if !ok {
		t.Fatalf("未注入 experimental: %s", raw)
	}
	clashAPI, ok := experimental["clash_api"].(map[string]any)
	if !ok || clashAPI["external_controller"] != api.URL {
		t.Fatalf("未注入 clash_api 监听地址: %s", raw)
	}
	// 证书落盘
	if _, err := os.Stat(filepath.Join(dir, "certs", "cert-a.pem")); err != nil {
		t.Fatalf("证书未落盘: %v", err)
	}
}

// TestSingBoxApplyConfigRollback 校验重载失败时回滚旧配置。
func TestSingBoxApplyConfigRollback(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "core.json")
	old := []byte(`{"inbounds":[{"tag":"old"}]}`)
	if err := os.WriteFile(configPath, old, 0o600); err != nil {
		t.Fatalf("写入旧配置失败: %v", err)
	}
	api, _ := newClashAPI(t, `{"up":0,"down":0}`, `{"connections":[]}`, http.StatusInternalServerError)

	impl, err := NewSingBox(Options{
		Type:       "sing-box",
		Binary:     "/bin/sh",
		ConfigPath: configPath,
		ClashAPI:   api.URL,
		Dir:        dir,
	})
	if err != nil {
		t.Fatalf("创建内核失败: %v", err)
	}
	err = impl.ApplyConfig(context.Background(), &Bundle{
		Version: 4,
		Config:  map[string]any{"inbounds": []any{map[string]any{"tag": "new"}}},
		Reload:  true,
	})
	if err == nil {
		t.Fatal("重载失败时应当返回错误")
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if string(raw) != string(old) {
		t.Fatalf("配置未回滚: %s", raw)
	}
}

// TestSingBoxSkipReload 校验 reload=false 时不调用重载。
func TestSingBoxSkipReload(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "core.json")
	api, reloads := newClashAPI(t, `{"up":0,"down":0}`, `{"connections":[]}`, 0)
	impl, err := NewSingBox(Options{Type: "sing-box", Binary: "/bin/sh", ConfigPath: configPath, ClashAPI: api.URL, Dir: dir})
	if err != nil {
		t.Fatalf("创建内核失败: %v", err)
	}
	if err := impl.ApplyConfig(context.Background(), &Bundle{
		Version: 5,
		Config:  map[string]any{"inbounds": []any{}},
		Reload:  false,
	}); err != nil {
		t.Fatalf("应用配置失败: %v", err)
	}
	if *reloads != 0 {
		t.Fatalf("reload=false 时不应调用重载，实际 %d", *reloads)
	}
}

// TestSingBoxStats 校验流量统计解析（字节单位、per-user 标签）。
func TestSingBoxStats(t *testing.T) {
	api, _ := newClashAPI(t,
		`{"up":1000,"down":2000}`,
		`{"connections":[
			{"upload":10,"download":20,"metadata":{"user":"u_1001"}},
			{"upload":30,"download":40,"metadata":{"user":"u_1001"}},
			{"upload":50,"download":60,"metadata":{"user":"u_1002"}},
			{"upload":70,"download":80,"metadata":{}}
		]}`,
		0)
	impl, err := NewSingBox(Options{Type: "sing-box", Binary: "/bin/sh", ConfigPath: filepath.Join(t.TempDir(), "core.json"), ClashAPI: api.URL})
	if err != nil {
		t.Fatalf("创建内核失败: %v", err)
	}
	stats, err := impl.Stats(context.Background())
	if err != nil {
		t.Fatalf("采集统计失败: %v", err)
	}
	if stats.TotalUpload != 1000 || stats.TotalDownload != 2000 {
		t.Fatalf("总流量不对: %+v", stats)
	}
	if len(stats.Users) != 2 {
		t.Fatalf("用户数不对: %+v", stats.Users)
	}
	if stats.Users["u_1001"].Upload != 40 || stats.Users["u_1001"].Download != 60 {
		t.Fatalf("u_1001 统计不对: %+v", stats.Users["u_1001"])
	}
	if stats.Users["u_1002"].Upload != 50 || stats.Users["u_1002"].Download != 60 {
		t.Fatalf("u_1002 统计不对: %+v", stats.Users["u_1002"])
	}
	if stats.OnlineUsers != 2 {
		t.Fatalf("在线用户数不对: %d", stats.OnlineUsers)
	}
}

// TestFakeCore 校验假内核的行为。
func TestFakeCore(t *testing.T) {
	fake := NewFake(Options{})
	ctx := context.Background()
	if err := fake.ApplyConfig(ctx, &Bundle{Version: 1}); err != nil {
		t.Fatalf("应用配置失败: %v", err)
	}
	if len(fake.Bundles()) != 1 {
		t.Fatalf("配置未记录")
	}
	if err := fake.Restart(ctx); err != nil {
		t.Fatalf("重启失败: %v", err)
	}
	if fake.Restarts() != 1 {
		t.Fatalf("重启次数不对: %d", fake.Restarts())
	}
	version, err := fake.Version(ctx)
	if err != nil || version == "" {
		t.Fatalf("版本查询失败: %v %s", err, version)
	}
	fake.SetStats(Stats{Users: map[string]UserStat{"u_1": {Upload: 1, Download: 2}}})
	stats, err := fake.Stats(ctx)
	if err != nil {
		t.Fatalf("统计失败: %v", err)
	}
	if stats.Users["u_1"].Upload != 1 {
		t.Fatalf("统计不对: %+v", stats)
	}
	fake.SetApplyError(io.ErrUnexpectedEOF)
	if err := fake.ApplyConfig(ctx, &Bundle{}); err == nil {
		t.Fatal("应当返回错误")
	}
}

// TestParseVersion 校验版本号解析。
func TestParseVersion(t *testing.T) {
	cases := map[string]string{
		"sing-box version 1.12.0\n":         "1.12.0",
		"sing-box version v1.12.0-beta.1\n": "1.12.0-beta.1",
		"unknown":                           "unknown",
	}
	for input, want := range cases {
		if got := parseVersion(input); got != want {
			t.Fatalf("版本解析错误: %q -> %q（期望 %q）", input, got, want)
		}
	}
}

// TestSanitizeName 校验证书名清洗。
func TestSanitizeName(t *testing.T) {
	if got := sanitizeName("../evil"); strings.Contains(got, "/") || strings.Contains(got, "..") {
		t.Fatalf("文件名未清洗: %q", got)
	}
	if got := sanitizeName("cert-a"); got != "cert-a" {
		t.Fatalf("正常文件名被改动: %q", got)
	}
}

// TestBackoffDelay 校验退避时长：30s、1m、2m…上限 5m。
func TestBackoffDelay(t *testing.T) {
	max := int64(5 * 60)
	cases := []struct {
		attempt int
		want    int64
	}{
		{1, 30},
		{2, 60},
		{3, 120},
		{10, max},
	}
	for _, c := range cases {
		got := int64(backoffDelay(c.attempt, 5*60*1e9))
		if got != c.want*1e9 {
			t.Fatalf("第 %d 次退避应为 %ds，实际 %v", c.attempt, c.want, got/1e9)
		}
	}
}
