package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const sampleYAML = `
panel:
  url: "https://panel.example.com"
  node_id: "9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"
  node_secret: "registration-token-123"

core:
  type: "sing-box"
  binary: "/usr/local/bin/sing-box"
  config_path: "/etc/sparrow-agent/core.json"
  version_constraint: ">=1.12.0 <2.0.0"

agent:
  data_dir: "/var/lib/sparrow-agent"
  heartbeat_interval: 30s
  config_poll_interval: 300s
  command_poll_timeout: 25s
  max_backoff: 5m
  log_level: "info"
  log_file: "/var/log/sparrow-agent.log"

tls:
  ca_file: ""
  insecure: false
  server_name: ""

update:
  enabled: true
  channel: "stable"
  source: "panel"
`

// TestParseSample 校验 YAML 解析结果与设计文档一致。
func TestParseSample(t *testing.T) {
	cfg, err := Parse([]byte(sampleYAML))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if cfg.Panel.URL != "https://panel.example.com" {
		t.Fatalf("panel.url 不对: %s", cfg.Panel.URL)
	}
	if cfg.Panel.NodeID == "" || cfg.Panel.NodeSecret == "" {
		t.Fatal("节点身份解析失败")
	}
	if cfg.Core.Type != "sing-box" || cfg.Core.Binary != "/usr/local/bin/sing-box" {
		t.Fatalf("内核配置解析失败: %+v", cfg.Core)
	}
	if cfg.Agent.HeartbeatInterval.Duration() != 30*time.Second {
		t.Fatalf("心跳间隔不对: %s", cfg.Agent.HeartbeatInterval.Duration())
	}
	if cfg.Agent.ConfigPollInterval.Duration() != 300*time.Second {
		t.Fatalf("配置轮询间隔不对: %s", cfg.Agent.ConfigPollInterval.Duration())
	}
	if cfg.Agent.CommandPollTimeout.Duration() != 25*time.Second {
		t.Fatalf("命令长轮询超时不对: %s", cfg.Agent.CommandPollTimeout.Duration())
	}
	if cfg.Agent.MaxBackoff.Duration() != 5*time.Minute {
		t.Fatalf("退避上限不对: %s", cfg.Agent.MaxBackoff.Duration())
	}
	if cfg.Agent.DataDir != "/var/lib/sparrow-agent" {
		t.Fatalf("数据目录不对: %s", cfg.Agent.DataDir)
	}
	if !cfg.Update.Enabled || cfg.Update.Channel != "stable" {
		t.Fatalf("自更新配置解析失败: %+v", cfg.Update)
	}
}

// TestParseDurationVariants 校验时长既支持 "30s" 也支持整数秒。
func TestParseDurationVariants(t *testing.T) {
	cfg, err := Parse([]byte("agent:\n  heartbeat_interval: 45\n"))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if cfg.Agent.HeartbeatInterval.Duration() != 45*time.Second {
		t.Fatalf("整数秒解析失败: %s", cfg.Agent.HeartbeatInterval.Duration())
	}
	if _, err := Parse([]byte("agent:\n  heartbeat_interval: \"abc\"\n")); err == nil {
		t.Fatal("非法时长应当报错")
	}
}

// TestApplyEnvOverrides 校验环境变量可以覆盖敏感项。
func TestApplyEnvOverrides(t *testing.T) {
	t.Setenv(EnvPanelURL, "https://env.example.com")
	t.Setenv(EnvNodeID, "11111111-2222-4333-8444-555555555555")
	t.Setenv(EnvNodeSecret, "registration-token-123")
	t.Setenv(EnvDataDir, "/tmp/sparrow-env")

	cfg, err := Parse([]byte(sampleYAML))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if err := cfg.ApplyEnv(); err != nil {
		t.Fatalf("应用环境变量失败: %v", err)
	}
	if cfg.Panel.URL != "https://env.example.com" {
		t.Fatalf("环境变量未覆盖 panel.url: %s", cfg.Panel.URL)
	}
	if cfg.Panel.NodeID != "11111111-2222-4333-8444-555555555555" {
		t.Fatalf("环境变量未覆盖 node_id: %s", cfg.Panel.NodeID)
	}
	if cfg.Panel.NodeSecret != "registration-token-123" {
		t.Fatal("环境变量未覆盖 node_secret")
	}
	if cfg.Agent.DataDir != "/tmp/sparrow-env" {
		t.Fatalf("环境变量未覆盖 data_dir: %s", cfg.Agent.DataDir)
	}
}

// TestValidate 校验配置校验规则。
func TestValidate(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*Config)
		wantErr string
	}{
		{"缺少面板地址", func(c *Config) { c.Panel.URL = "" }, "panel.url"},
		{"非法协议", func(c *Config) { c.Panel.URL = "ftp://x" }, "http/https"},
		{"非法内核", func(c *Config) { c.Core.Type = "v2ray" }, "core.type"},
		{"非法日志级别", func(c *Config) { c.Agent.LogLevel = "trace" }, "log_level"},
		{"缺少数据目录", func(c *Config) { c.Agent.DataDir = "" }, "data_dir"},
		{"有节点 ID 无密钥", func(c *Config) { c.Panel.NodeSecret = "" }, "node_secret"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cfg, err := Parse([]byte(sampleYAML))
			if err != nil {
				t.Fatalf("解析失败: %v", err)
			}
			c.mutate(cfg)
			err = cfg.Validate()
			if err == nil {
				t.Fatal("应当校验失败")
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("错误信息不包含 %q: %v", c.wantErr, err)
			}
		})
	}
}

// TestValidateForRun 校验运行前必须有节点身份。
func TestValidateForRun(t *testing.T) {
	cfg, err := Parse([]byte(sampleYAML))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	cfg.Panel.NodeID = ""
	if err := cfg.ValidateForRun(); err == nil {
		t.Fatal("缺少 node_id 时应当报错")
	}
	cfg.Panel.NodeID = "9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"
	if err := cfg.ValidateForRun(); err != nil {
		t.Fatalf("完整配置应当通过校验: %v", err)
	}
}

// TestLoadAndSave 校验配置读写（含敏感项脱敏）。
func TestLoadAndSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	cfg, err := Parse([]byte(sampleYAML))
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if err := cfg.Save(path); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("配置文件权限应为 0600，实际 %o", perm)
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}
	if loaded.Panel.NodeSecret != cfg.Panel.NodeSecret {
		t.Fatal("配置往返后密钥不一致")
	}
	redacted := loaded.Redacted()
	if strings.Contains(redacted.Panel.NodeSecret, "unit") && redacted.Panel.NodeSecret != "****" {
		t.Fatalf("密钥未被脱敏: %s", redacted.Panel.NodeSecret)
	}
}

// TestLoadMissingFile 校验文件不存在时报错。
func TestLoadMissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "nope.yaml")); err == nil {
		t.Fatal("文件不存在时应当报错")
	}
}
