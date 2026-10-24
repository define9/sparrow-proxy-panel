// Package config 负责 Agent 配置的加载、默认值、环境变量覆盖与校验。
//
// 配置文件为 YAML（gopkg.in/yaml.v3），字段与
// docs/architecture/agent-cli.md 第 4 节保持一致。
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// 环境变量名：容器场景下用来覆盖配置（含敏感项）。
const (
	EnvPanelURL           = "SPARROW_PANEL_URL"
	EnvNodeID             = "SPARROW_NODE_ID"
	EnvNodeSecret         = "SPARROW_NODE_SECRET"
	EnvRegistrationToken  = "SPARROW_REGISTRATION_TOKEN"
	EnvDataDir            = "SPARROW_DATA_DIR"
	EnvLogLevel           = "SPARROW_LOG_LEVEL"
	EnvCoreType           = "SPARROW_CORE_TYPE"
	DefaultConfigPath     = "/etc/sparrow-agent/config.yaml"
	defaultHeartbeat      = 30 * time.Second
	defaultConfigPoll     = 300 * time.Second
	defaultCommandTimeout = 25 * time.Second
	defaultMaxBackoff     = 5 * time.Minute
	defaultMetricsAddr    = "127.0.0.1:9090"
)

// Duration 是支持 YAML 字符串（"30s"）与整数（秒）的时长类型。
type Duration time.Duration

// UnmarshalYAML 解析 YAML 中的时长。
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind != yaml.ScalarNode {
		return fmt.Errorf("config: 时长必须是标量，收到 %v", value.Kind)
	}
	if value.Tag == "!!int" {
		var seconds int64
		if err := value.Decode(&seconds); err != nil {
			return fmt.Errorf("config: 解析时长失败: %w", err)
		}
		*d = Duration(time.Duration(seconds) * time.Second)
		return nil
	}
	var raw string
	if err := value.Decode(&raw); err != nil {
		return fmt.Errorf("config: 解析时长失败: %w", err)
	}
	parsed, err := time.ParseDuration(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("config: 非法时长 %q: %w", raw, err)
	}
	*d = Duration(parsed)
	return nil
}

// MarshalYAML 把时长写回 YAML 时使用 "30s" 形式。
func (d Duration) MarshalYAML() (interface{}, error) {
	return time.Duration(d).String(), nil
}

// Duration 返回标准库时长。
func (d Duration) Duration() time.Duration { return time.Duration(d) }

// Panel 是面板连接相关配置。
type Panel struct {
	URL               string `yaml:"url"`
	NodeID            string `yaml:"node_id"`
	NodeSecret        string `yaml:"node_secret"`
	RegistrationToken string `yaml:"registration_token"`
}

// Core 是内核相关配置。
type Core struct {
	Type              string `yaml:"type"`
	Binary            string `yaml:"binary"`
	ConfigPath        string `yaml:"config_path"`
	VersionConstraint string `yaml:"version_constraint"`
	// ClashAPI 是内核的本地管理 API 地址（sing-box 的 experimental.clash_api）。
	ClashAPI string `yaml:"clash_api"`
}

// Agent 是 Agent 自身行为相关配置。
type Agent struct {
	DataDir             string   `yaml:"data_dir"`
	HeartbeatInterval   Duration `yaml:"heartbeat_interval"`
	ConfigPollInterval  Duration `yaml:"config_poll_interval"`
	CommandPollTimeout  Duration `yaml:"command_poll_timeout"`
	MaxBackoff          Duration `yaml:"max_backoff"`
	LogLevel            string   `yaml:"log_level"`
	LogFile             string   `yaml:"log_file"`
	MetricsAddr         string   `yaml:"metrics_addr"`
	TrafficBufferSize   int      `yaml:"traffic_buffer_size"`
	TrafficReportPeriod Duration `yaml:"traffic_report_interval"`
}

// TLS 是与面板通信时的 TLS 配置。
type TLS struct {
	CAFile     string `yaml:"ca_file"`
	Insecure   bool   `yaml:"insecure"`
	ServerName string `yaml:"server_name"`
}

// Update 是自更新相关配置。
type Update struct {
	Enabled    bool     `yaml:"enabled"`
	Channel    string   `yaml:"channel"`
	Source     string   `yaml:"source"`
	CustomURL  string   `yaml:"custom_url"`
	PublicKey  string   `yaml:"public_key"`
	MirrorURLs []string `yaml:"mirror_urls"`
}

// Config 是 Agent 的完整配置。
type Config struct {
	Panel  Panel  `yaml:"panel"`
	Core   Core   `yaml:"core"`
	Agent  Agent  `yaml:"agent"`
	TLS    TLS    `yaml:"tls"`
	Update Update `yaml:"update"`
}

// Default 返回带默认值的配置。
func Default() *Config {
	return &Config{
		Core: Core{
			Type: "sing-box",
		},
		Agent: Agent{
			DataDir:             "/var/lib/sparrow-agent",
			HeartbeatInterval:   Duration(defaultHeartbeat),
			ConfigPollInterval:  Duration(defaultConfigPoll),
			CommandPollTimeout:  Duration(defaultCommandTimeout),
			MaxBackoff:          Duration(defaultMaxBackoff),
			LogLevel:            "info",
			MetricsAddr:         defaultMetricsAddr,
			TrafficBufferSize:   5000,
			TrafficReportPeriod: Duration(defaultHeartbeat),
		},
		Update: Update{
			Enabled: true,
			Channel: "stable",
			Source:  "panel",
		},
	}
}

// Load 从磁盘读取配置文件，套用默认值与环境变量覆盖，然后校验。
//
// path 为空时返回错误；文件不存在也会返回错误（调用方自行决定是否回退到默认配置）。
func Load(path string) (*Config, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("config: 配置文件路径为空")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: 读取配置文件失败: %w", err)
	}
	cfg, err := Parse(raw)
	if err != nil {
		return nil, err
	}
	if err := cfg.ApplyEnv(); err != nil {
		return nil, err
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Parse 解析 YAML 内容（不读文件），套用默认值。
func Parse(raw []byte) (*Config, error) {
	cfg := Default()
	if err := yaml.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("config: 解析 YAML 失败: %w", err)
	}
	cfg.normalize()
	return cfg, nil
}

// normalize 规整路径与空值。
func (c *Config) normalize() {
	c.Panel.URL = strings.TrimSpace(c.Panel.URL)
	c.Panel.NodeID = strings.TrimSpace(c.Panel.NodeID)
	c.Panel.NodeSecret = strings.TrimSpace(c.Panel.NodeSecret)
	c.Core.Type = strings.ToLower(strings.TrimSpace(c.Core.Type))
	c.Core.Binary = strings.TrimSpace(c.Core.Binary)
	c.Core.ConfigPath = strings.TrimSpace(c.Core.ConfigPath)
	c.Agent.DataDir = strings.TrimSpace(c.Agent.DataDir)
	c.Agent.LogLevel = strings.ToLower(strings.TrimSpace(c.Agent.LogLevel))
	c.Agent.MetricsAddr = strings.TrimSpace(c.Agent.MetricsAddr)

	if c.Agent.HeartbeatInterval <= 0 {
		c.Agent.HeartbeatInterval = Duration(defaultHeartbeat)
	}
	if c.Agent.ConfigPollInterval <= 0 {
		c.Agent.ConfigPollInterval = Duration(defaultConfigPoll)
	}
	if c.Agent.CommandPollTimeout <= 0 {
		c.Agent.CommandPollTimeout = Duration(defaultCommandTimeout)
	}
	if c.Agent.MaxBackoff <= 0 {
		c.Agent.MaxBackoff = Duration(defaultMaxBackoff)
	}
	if c.Agent.TrafficReportPeriod <= 0 {
		c.Agent.TrafficReportPeriod = c.Agent.HeartbeatInterval
	}
	if c.Agent.TrafficBufferSize <= 0 {
		c.Agent.TrafficBufferSize = 5000
	}
	if c.Agent.LogLevel == "" {
		c.Agent.LogLevel = "info"
	}
	if c.Agent.MetricsAddr == "" {
		c.Agent.MetricsAddr = defaultMetricsAddr
	}
	if c.Core.Type == "" {
		c.Core.Type = "sing-box"
	}
}

// ApplyEnv 用环境变量覆盖配置（敏感项优先从环境读取）。
//
// 只在对应环境变量存在且非空时覆盖。
func (c *Config) ApplyEnv() error {
	if v := strings.TrimSpace(os.Getenv(EnvPanelURL)); v != "" {
		c.Panel.URL = v
	}
	if v := strings.TrimSpace(os.Getenv(EnvNodeID)); v != "" {
		c.Panel.NodeID = v
	}
	if v := strings.TrimSpace(os.Getenv(EnvNodeSecret)); v != "" {
		c.Panel.NodeSecret = v
	}
	if v := strings.TrimSpace(os.Getenv(EnvRegistrationToken)); v != "" {
		c.Panel.RegistrationToken = v
	}
	if v := strings.TrimSpace(os.Getenv(EnvDataDir)); v != "" {
		c.Agent.DataDir = v
	}
	if v := strings.TrimSpace(os.Getenv(EnvLogLevel)); v != "" {
		c.Agent.LogLevel = strings.ToLower(v)
	}
	if v := strings.TrimSpace(os.Getenv(EnvCoreType)); v != "" {
		c.Core.Type = strings.ToLower(v)
	}
	c.normalize()
	return nil
}

// Validate 校验配置的整体合法性。
func (c *Config) Validate() error {
	if c.Panel.URL == "" {
		return fmt.Errorf("config: panel.url 不能为空")
	}
	parsed, err := url.Parse(c.Panel.URL)
	if err != nil {
		return fmt.Errorf("config: panel.url 非法: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("config: panel.url 必须是 http/https，当前为 %q", parsed.Scheme)
	}
	if parsed.Host == "" {
		return fmt.Errorf("config: panel.url 缺少主机名")
	}

	switch c.Core.Type {
	case "sing-box", "xray":
	default:
		return fmt.Errorf("config: core.type 只能是 sing-box 或 xray，当前为 %q", c.Core.Type)
	}

	if c.Agent.DataDir == "" {
		return fmt.Errorf("config: agent.data_dir 不能为空")
	}
	if c.Agent.HeartbeatInterval <= 0 {
		return fmt.Errorf("config: agent.heartbeat_interval 必须大于 0")
	}
	if c.Agent.ConfigPollInterval <= 0 {
		return fmt.Errorf("config: agent.config_poll_interval 必须大于 0")
	}
	if c.Agent.CommandPollTimeout <= 0 {
		return fmt.Errorf("config: agent.command_poll_timeout 必须大于 0")
	}
	if c.Agent.MaxBackoff < Duration(time.Second) {
		return fmt.Errorf("config: agent.max_backoff 至少为 1s")
	}
	switch c.Agent.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("config: agent.log_level 只能是 debug/info/warn/error，当前为 %q", c.Agent.LogLevel)
	}
	if c.Panel.NodeID != "" && c.Panel.NodeSecret == "" {
		return fmt.Errorf("config: 设置了 node_id 但缺少 node_secret")
	}
	return nil
}

// ValidateForRun 校验「运行 Agent」所需的配置（必须已有节点身份）。
func (c *Config) ValidateForRun() error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.Panel.NodeID == "" {
		return fmt.Errorf("config: 缺少 panel.node_id，请先执行 `sparrow-agent register`")
	}
	if c.Panel.NodeSecret == "" {
		return fmt.Errorf("config: 缺少 panel.node_secret，请先执行 `sparrow-agent register`")
	}
	if len(c.Panel.NodeSecret) < 16 {
		return fmt.Errorf("config: panel.node_secret 长度不足（至少 16 个字符）")
	}
	return nil
}

// StateDir 返回状态目录（data_dir）。
func (c *Config) StateDir() string { return c.Agent.DataDir }

// CacheFile 返回本地配置缓存文件路径。
func (c *Config) CacheFile() string {
	return filepath.Join(c.Agent.DataDir, "config-cache.json")
}

// TrafficStateFile 返回流量状态文件路径（累计值与 seq）。
func (c *Config) TrafficStateFile() string {
	return filepath.Join(c.Agent.DataDir, "traffic-state.json")
}

// TrafficOutboxFile 返回流量补报队列文件路径。
func (c *Config) TrafficOutboxFile() string {
	return filepath.Join(c.Agent.DataDir, "traffic-outbox.json")
}

// Save 把配置写回磁盘（用于 register 之后落盘节点身份）。
//
// 文件权限固定为 0600，避免节点密钥被其他用户读取。
func (c *Config) Save(path string) error {
	raw, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("config: 序列化配置失败: %w", err)
	}
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("config: 创建配置目录失败: %w", err)
		}
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return fmt.Errorf("config: 写入配置文件失败: %w", err)
	}
	return nil
}

// Redacted 返回脱敏后的配置副本（用于 `sparrow-agent config` 输出）。
func (c *Config) Redacted() *Config {
	clone := *c
	clone.Panel.NodeSecret = maskSecret(c.Panel.NodeSecret)
	clone.Panel.RegistrationToken = maskSecret(c.Panel.RegistrationToken)
	clone.Update.PublicKey = maskSecret(c.Update.PublicKey)
	return &clone
}

// maskSecret 把敏感串替换成固定长度的掩码。
func maskSecret(v string) string {
	if v == "" {
		return ""
	}
	return "****"
}
