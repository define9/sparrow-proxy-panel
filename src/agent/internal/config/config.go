// Package config 负责 /etc/sparrow-agent/config.yaml 的加载、校验与回写。
package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Duration 让 YAML 支持 `30s` / `5m` 这类写法。
type Duration time.Duration

func (d *Duration) UnmarshalYAML(node *yaml.Node) error {
	var raw string
	if err := node.Decode(&raw); err != nil {
		return err
	}
	if raw == "" {
		*d = 0
		return nil
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil {
		return fmt.Errorf("非法时长 %q: %w", raw, err)
	}
	*d = Duration(parsed)
	return nil
}

func (d Duration) MarshalYAML() (interface{}, error) { return time.Duration(d).String(), nil }

func (d Duration) Value() time.Duration { return time.Duration(d) }

type Panel struct {
	URL        string `yaml:"url"`
	NodeID     string `yaml:"node_id"`
	NodeSecret string `yaml:"node_secret"`
}

type Core struct {
	Type              string `yaml:"type"`
	Binary            string `yaml:"binary"`
	ConfigPath        string `yaml:"config_path"`
	VersionConstraint string `yaml:"version_constraint"`
}

type Agent struct {
	DataDir            string   `yaml:"data_dir"`
	HeartbeatInterval  Duration `yaml:"heartbeat_interval"`
	ConfigPollInterval Duration `yaml:"config_poll_interval"`
	CommandPollTimeout Duration `yaml:"command_poll_timeout"`
	MaxBackoff         Duration `yaml:"max_backoff"`
	LogLevel           string   `yaml:"log_level"`
	LogFile            string   `yaml:"log_file"`
}

type TLS struct {
	CAFile     string `yaml:"ca_file"`
	Insecure   bool   `yaml:"insecure"`
	ServerName string `yaml:"server_name"`
}

type Update struct {
	Enabled   bool   `yaml:"enabled"`
	Channel   string `yaml:"channel"`
	Source    string `yaml:"source"`
	CustomURL string `yaml:"custom_url"`
	PublicKey string `yaml:"public_key"`
}

type Config struct {
	Panel  Panel  `yaml:"panel"`
	Core   Core   `yaml:"core"`
	Agent  Agent  `yaml:"agent"`
	TLS    TLS    `yaml:"tls"`
	Update Update `yaml:"update"`

	path string
}

const (
	defaultHeartbeat  = 30 * time.Second
	defaultConfigPoll = 5 * time.Minute
	defaultCommandTTL = 25 * time.Second
	defaultBackoff    = 5 * time.Minute
)

// Load 读配置、套默认值、应用环境变量覆盖、校验。
func Load(path string) (*Config, error) {
	cfg := &Config{path: path}

	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}
	if err := yaml.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("解析 YAML 失败: %w", err)
	}

	cfg.applyEnv()
	cfg.applyDefaults()

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// applyEnv 让容器可以用环境变量注入敏感字段（密钥不进配置文件）。
func (c *Config) applyEnv() {
	if v := os.Getenv("SPARROW_PANEL_URL"); v != "" {
		c.Panel.URL = v
	}
	if v := os.Getenv("SPARROW_NODE_ID"); v != "" {
		c.Panel.NodeID = v
	}
	if v := os.Getenv("SPARROW_NODE_SECRET"); v != "" {
		c.Panel.NodeSecret = v
	}
	if v := os.Getenv("SPARROW_DATA_DIR"); v != "" {
		c.Agent.DataDir = v
	}
	if v := os.Getenv("SPARROW_LOG_LEVEL"); v != "" {
		c.Agent.LogLevel = v
	}
}

func (c *Config) applyDefaults() {
	if c.Agent.DataDir == "" {
		c.Agent.DataDir = "/var/lib/sparrow-agent"
	}
	if c.Agent.HeartbeatInterval == 0 {
		c.Agent.HeartbeatInterval = Duration(defaultHeartbeat)
	}
	if c.Agent.ConfigPollInterval == 0 {
		c.Agent.ConfigPollInterval = Duration(defaultConfigPoll)
	}
	if c.Agent.CommandPollTimeout == 0 {
		c.Agent.CommandPollTimeout = Duration(defaultCommandTTL)
	}
	if c.Agent.MaxBackoff == 0 {
		c.Agent.MaxBackoff = Duration(defaultBackoff)
	}
	if c.Agent.LogLevel == "" {
		c.Agent.LogLevel = "info"
	}
	if c.Core.Type == "" {
		c.Core.Type = "sing-box"
	}
	if c.Core.Binary == "" {
		c.Core.Binary = "/usr/local/bin/sing-box"
	}
	if c.Core.ConfigPath == "" {
		c.Core.ConfigPath = "/etc/sparrow-agent/core.json"
	}
	if c.Update.Channel == "" {
		c.Update.Channel = "stable"
	}
	if c.Update.Source == "" {
		c.Update.Source = "panel"
	}
	c.Panel.URL = strings.TrimRight(c.Panel.URL, "/")
}

func (c *Config) Validate() error {
	if c.Panel.URL == "" {
		return fmt.Errorf("panel.url 不能为空")
	}
	if !strings.HasPrefix(c.Panel.URL, "https://") && !strings.HasPrefix(c.Panel.URL, "http://") {
		return fmt.Errorf("panel.url 必须是 http(s) 地址")
	}
	if c.Core.Type != "sing-box" && c.Core.Type != "xray" {
		return fmt.Errorf("core.type 只支持 sing-box / xray，当前 %q", c.Core.Type)
	}
	if c.Agent.HeartbeatInterval.Value() < 5*time.Second {
		return fmt.Errorf("heartbeat_interval 不能小于 5s")
	}
	return nil
}

// Registered 表示是否已完成首次注册。
func (c *Config) Registered() bool {
	return c.Panel.NodeID != "" && c.Panel.NodeSecret != ""
}

// Save 把节点凭据写回配置文件（register 子命令使用）。
// 注意：只改两个字段，保留文件其余内容（按行替换，避免破坏注释）。
func (c *Config) Save(nodeID, nodeSecret string) error {
	c.Panel.NodeID = nodeID
	c.Panel.NodeSecret = nodeSecret

	raw, err := os.ReadFile(c.path)
	if err != nil {
		return err
	}

	lines := strings.Split(string(raw), "\n")
	inPanel := false
	seenID, seenSecret := false, false

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "panel:") {
			inPanel = true
			continue
		}
		if inPanel && trimmed != "" && !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
			inPanel = false
		}
		if !inPanel {
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "node_id:"):
			lines[i] = "  node_id: \"" + nodeID + "\""
			seenID = true
		case strings.HasPrefix(trimmed, "node_secret:"):
			lines[i] = "  node_secret: \"" + nodeSecret + "\""
			seenSecret = true
		}
	}

	insertAt := -1
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "panel:") {
			insertAt = i + 1
			break
		}
	}
	extra := []string{}
	if !seenID {
		extra = append(extra, "  node_id: \""+nodeID+"\"")
	}
	if !seenSecret {
		extra = append(extra, "  node_secret: \""+nodeSecret+"\"")
	}
	if len(extra) > 0 {
		if insertAt < 0 {
			return fmt.Errorf("配置文件缺少 panel 段，请先补全")
		}
		lines = append(lines[:insertAt], append(extra, lines[insertAt:]...)...)
	}

	out := strings.Join(lines, "\n")
	if err := os.WriteFile(c.path, []byte(out), 0o600); err != nil {
		return err
	}
	return nil
}

func (c *Config) Path() string { return c.path }
