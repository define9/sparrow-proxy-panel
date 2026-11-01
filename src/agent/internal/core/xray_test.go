package core

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"sparrow/agent/internal/model"
)

func TestInjectXrayConfig(t *testing.T) {
	input := `{
	  "log": {"loglevel": "warning"},
	  "inbounds": [{"tag": "in-1", "port": 443, "protocol": "vless",
	    "settings": {"clients": [{"id": "uuid", "email": "lily@example.com", "uid": 479220}]}}],
	  "outbounds": [{"tag": "direct", "protocol": "freedom"}]
	}`

	injected, users, err := injectXrayConfig([]byte(input))
	if err != nil {
		t.Fatalf("injectXrayConfig: %v", err)
	}
	if uid := users["lily@example.com"]; uid != 479220 {
		t.Fatalf("xray clients 的 uid 未解析出来: %v", users)
	}

	var root map[string]any
	if err := json.Unmarshal(injected, &root); err != nil {
		t.Fatalf("注入结果不是合法 JSON: %v", err)
	}

	api := root["api"].(map[string]any)
	if api["listen"] != xrayAPIListen || api["tag"] != "api" {
		t.Fatalf("api 注入错误: %v", api)
	}
	services := api["services"].([]any)
	for _, required := range []string{"HandlerService", "StatsService"} {
		found := false
		for _, service := range services {
			if service == required {
				found = true
			}
		}
		if !found {
			t.Fatalf("api.services 缺少 %s: %v", required, services)
		}
	}

	if _, ok := root["stats"].(map[string]any); !ok {
		t.Fatalf("缺少 stats: %v", root["stats"])
	}

	policy := root["policy"].(map[string]any)
	system := policy["system"].(map[string]any)
	if system["statsInboundUplink"] != true || system["statsInboundDownlink"] != true {
		t.Fatalf("policy.system 注入错误: %v", system)
	}
	level0 := policy["levels"].(map[string]any)["0"].(map[string]any)
	if level0["statsUserUplink"] != true || level0["statsUserDownlink"] != true {
		t.Fatalf("policy.levels.0 注入错误: %v", level0)
	}

	// 原有字段不能被破坏。
	if root["log"].(map[string]any)["loglevel"] != "warning" {
		t.Fatalf("log 被破坏: %v", root["log"])
	}
	if root["outbounds"].([]any)[0].(map[string]any)["tag"] != "direct" {
		t.Fatalf("outbounds 被破坏: %v", root["outbounds"])
	}
}

func TestInjectXrayConfigKeepsExistingAPI(t *testing.T) {
	input := `{
	  "api": {"tag": "myapi", "listen": "127.0.0.1:10086", "services": ["HandlerService"]},
	  "policy": {"levels": {"0": {"handshake": 4, "statsUserUplink": false}}}
	}`

	injected, _, err := injectXrayConfig([]byte(input))
	if err != nil {
		t.Fatalf("injectXrayConfig: %v", err)
	}

	var root map[string]any
	if err := json.Unmarshal(injected, &root); err != nil {
		t.Fatalf("注入结果不是合法 JSON: %v", err)
	}

	api := root["api"].(map[string]any)
	if api["tag"] != "myapi" || api["listen"] != "127.0.0.1:10086" {
		t.Fatalf("已有 api 被覆盖: %v", api)
	}

	level0 := root["policy"].(map[string]any)["levels"].(map[string]any)["0"].(map[string]any)
	if level0["statsUserUplink"] != false {
		t.Fatalf("已有 policy 值被覆盖: %v", level0)
	}
	if level0["handshake"] != float64(4) {
		t.Fatalf("policy.levels.0 其它字段被丢掉: %v", level0)
	}
}

func TestParseXrayStats(t *testing.T) {
	raw := []byte(`{"stat":[
	  {"name":"user>>>lily@example.com>>>traffic>>>uplink","value":"1024"},
	  {"name":"user>>>lily@example.com>>>traffic>>>downlink","value":"2048"},
	  {"name":"inbound>>>in-1>>>traffic>>>uplink","value":"9"}
	]}`)

	stats, err := parseXrayStats(raw)
	if err != nil {
		t.Fatalf("parseXrayStats: %v", err)
	}
	if len(stats) != 3 {
		t.Fatalf("应解析出 3 条 stat，实际 %d", len(stats))
	}

	email, direction, ok := parseXrayStatName(stats[0].Name)
	if !ok || email != "lily@example.com" || direction != "uplink" {
		t.Fatalf("stat name 解析错误: %q %q %v", email, direction, ok)
	}
	if got := stats[0].int64(); got != 1024 {
		t.Fatalf("value 解析错误: %d", got)
	}

	if _, err := parseXrayStats([]byte("not json")); err == nil {
		t.Fatal("非 JSON 输出应返回 error")
	}
	if _, err := parseXrayStats(nil); err == nil {
		t.Fatal("空输出应返回 error")
	}
}

func TestXrayStatsAggregatesByUID(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("假内核脚本依赖 POSIX shell")
	}

	dir := t.TempDir()
	binary := filepath.Join(dir, "fake-xray")
	script := "#!/bin/sh\n" +
		"cat <<'EOF'\n" +
		`{"stat":[` +
		`{"name":"user>>>lily@example.com>>>traffic>>>uplink","value":"1024"},` +
		`{"name":"user>>>lily@example.com>>>traffic>>>downlink","value":"2048"},` +
		`{"name":"user>>>bob@example.com>>>traffic>>>uplink","value":"7"},` +
		`{"name":"user>>>bob@example.com>>>traffic>>>downlink","value":"9"},` +
		`{"name":"user>>>ghost@example.com>>>traffic>>>uplink","value":"5"},` +
		`{"name":"inbound>>>in-1>>>traffic>>>uplink","value":"1"}` +
		`]}` + "\n" +
		"EOF\n"
	if err := os.WriteFile(binary, []byte(script), 0o755); err != nil {
		t.Fatalf("写假内核: %v", err)
	}

	box := newXray(Options{Binary: binary})
	box.SetUsers([]model.ConfigUser{
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
	if got := byUID[479220]; got.Upload != 1024 || got.Download != 2048 {
		t.Fatalf("lily 统计错误: %+v", got)
	}
	if got := byUID[111]; got.Upload != 7 || got.Download != 9 {
		t.Fatalf("bob 统计错误: %+v", got)
	}
}

func TestXrayStatsReportsMissingBinary(t *testing.T) {
	box := newXray(Options{Binary: filepath.Join(t.TempDir(), "does-not-exist")})
	_, err := box.Stats(context.Background())
	if err == nil {
		t.Fatal("可执行文件不存在时应返回 error")
	}
	if !strings.Contains(err.Error(), "找不到 xray 可执行文件") {
		t.Fatalf("错误信息应说明找不到可执行文件: %v", err)
	}
}
