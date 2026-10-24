// sparrow-agent 是部署在代理节点上的 CLI 程序。
//
// 详细设计见 docs/architecture/agent-cli.md。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/sparrows/sparrow-agent/internal/agent"
	"github.com/sparrows/sparrow-agent/internal/cache"
	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/config"
	"github.com/sparrows/sparrow-agent/internal/core"
	"github.com/sparrows/sparrow-agent/internal/health"
	"github.com/sparrows/sparrow-agent/internal/logger"
	"github.com/sparrows/sparrow-agent/internal/metrics"
	"github.com/sparrows/sparrow-agent/internal/traffic"
	"github.com/sparrows/sparrow-agent/internal/version"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "version", "-v", "--version":
		fmt.Printf("sparrow-agent %s (commit %s, built %s)\n", version.Version, version.Commit, version.BuildDate)
	case "run":
		err = runCommand(os.Args[2:])
	case "register":
		err = registerCommand(os.Args[2:])
	case "status":
		err = statusCommand(os.Args[2:])
	case "config":
		err = configCommand(os.Args[2:])
	case "doctor":
		err = doctorCommand(os.Args[2:])
	case "help", "-h", "--help":
		usage()
	default:
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}

// runCommand 前台运行 Agent。
func runCommand(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	configPath := fs.String("c", config.DefaultConfigPath, "配置文件路径")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	if err := cfg.ValidateForRun(); err != nil {
		return err
	}

	log, levelVar, err := logger.NewWithLevelVar(logger.Options{Level: cfg.Agent.LogLevel, File: cfg.Agent.LogFile})
	if err != nil {
		return err
	}
	log.Info("sparrow-agent 启动", "version", version.Version, "panel", cfg.Panel.URL, "core", cfg.Core.Type)

	api, err := client.New(client.Options{
		BaseURL: cfg.Panel.URL,
		NodeID:  cfg.Panel.NodeID,
		Secret:  cfg.Panel.NodeSecret,
		Logger:  log,
	})
	if err != nil {
		return err
	}

	coreImpl, err := newCore(cfg, log)
	if err != nil {
		return err
	}

	reg := metrics.New()
	ag, err := agent.New(agent.Options{
		Config:   cfg,
		Client:   api,
		Core:     coreImpl,
		Logger:   log,
		Metrics:  reg,
		Cache:    cache.New(cfg.CacheFile()),
		LevelVar: levelVar,
	})
	if err != nil {
		return err
	}

	// 本地可观测端点（默认 127.0.0.1:9090）
	var healthServer *health.Server
	if cfg.Agent.MetricsAddr != "" {
		healthServer = health.New(cfg.Agent.MetricsAddr, reg, ag.State, log)
		if err := healthServer.Start(); err != nil {
			log.Warn("启动本地指标服务失败", "error", err.Error())
		} else {
			log.Info("本地指标服务已启动", "addr", cfg.Agent.MetricsAddr)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := ag.Run(ctx); err != nil {
		return err
	}
	if healthServer != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = healthServer.Shutdown(shutdownCtx)
	}
	log.Info("sparrow-agent 已退出")
	return nil
}

// registerCommand 注册节点并把节点身份写回配置文件。
func registerCommand(args []string) error {
	fs := flag.NewFlagSet("register", flag.ContinueOnError)
	configPath := fs.String("c", config.DefaultConfigPath, "配置文件路径")
	panelURL := fs.String("url", "", "面板地址")
	token := fs.String("token", "", "一次性注册令牌（也可用 SPARROW_REGISTRATION_TOKEN）")
	coreType := fs.String("core", "", "内核类型（sing-box / xray）")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := loadOrDefault(*configPath)
	if err != nil {
		return err
	}
	if *panelURL != "" {
		cfg.Panel.URL = *panelURL
	}
	if *coreType != "" {
		cfg.Core.Type = strings.ToLower(*coreType)
	}
	if *token != "" {
		cfg.Panel.RegistrationToken = *token
	}
	if err := cfg.ApplyEnv(); err != nil {
		return err
	}
	if cfg.Panel.RegistrationToken == "" {
		return errors.New("缺少注册令牌：请使用 --token 或环境变量 SPARROW_REGISTRATION_TOKEN")
	}
	if err := cfg.Validate(); err != nil {
		return err
	}

	api, err := client.New(client.Options{BaseURL: cfg.Panel.URL, NodeID: placeholderNodeID})
	if err != nil {
		return err
	}
	req := client.AgentRegisterRequest{
		Hostname:     hostname(),
		AgentVersion: version.Version,
		Os:           runtime.GOOS,
		Arch:         runtime.GOARCH,
	}
	if cfg.Core.Type != "" {
		coreValue := client.AgentRegisterRequestCore(cfg.Core.Type)
		req.Core = &coreValue
	}
	if ip := localIP(); ip != "" {
		req.Ip = &ip
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resp, err := api.Register(ctx, cfg.Panel.RegistrationToken, req)
	if err != nil {
		return err
	}

	cfg.Panel.NodeID = resp.NodeId.String()
	cfg.Panel.NodeSecret = resp.NodeSecret
	if resp.HeartbeatInterval > 0 {
		cfg.Agent.HeartbeatInterval = config.Duration(time.Duration(resp.HeartbeatInterval) * time.Second)
	}
	if resp.ConfigPollInterval > 0 {
		cfg.Agent.ConfigPollInterval = config.Duration(time.Duration(resp.ConfigPollInterval) * time.Second)
	}
	if err := cfg.Save(*configPath); err != nil {
		return err
	}
	fmt.Printf("注册成功：节点 %s 已写入 %s\n", cfg.Panel.NodeID, *configPath)
	return nil
}

// statusCommand 打印本地状态。
func statusCommand(args []string) error {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	configPath := fs.String("c", config.DefaultConfigPath, "配置文件路径")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := loadOrDefault(*configPath)
	if err != nil {
		return err
	}

	status := map[string]any{
		"agentVersion": version.Version,
		"panel":        cfg.Panel.URL,
		"nodeId":       cfg.Panel.NodeID,
		"core":         cfg.Core.Type,
		"dataDir":      cfg.Agent.DataDir,
	}
	if entry, err := cache.New(cfg.CacheFile()).Load(); err == nil && entry != nil {
		status["configVersion"] = entry.Version
		status["configCachedAt"] = entry.ReceivedAt.Format(time.RFC3339)
	} else {
		status["configVersion"] = 0
	}
	if outbox, err := traffic.NewOutbox(cfg.TrafficOutboxFile(), cfg.Agent.TrafficBufferSize); err == nil {
		status["pendingTrafficReports"] = outbox.Len()
		status["lastTrafficSeq"] = outbox.Seq()
	}
	raw, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(raw))
	return nil
}

// configCommand 打印当前生效配置（脱敏）。
func configCommand(args []string) error {
	fs := flag.NewFlagSet("config", flag.ContinueOnError)
	configPath := fs.String("c", config.DefaultConfigPath, "配置文件路径")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	raw, err := yamlMarshal(cfg.Redacted())
	if err != nil {
		return err
	}
	fmt.Print(string(raw))
	return nil
}

// doctorCommand 自检：配置、内核、网络、面板连通性。
func doctorCommand(args []string) error {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
	configPath := fs.String("c", config.DefaultConfigPath, "配置文件路径")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := loadOrDefault(*configPath)
	if err != nil {
		return err
	}

	fmt.Println("== 配置 ==")
	if err := cfg.Validate(); err != nil {
		fmt.Printf("  配置校验: 失败 (%v)\n", err)
	} else {
		fmt.Printf("  配置校验: 通过 (panel=%s, core=%s)\n", cfg.Panel.URL, cfg.Core.Type)
	}
	if cfg.Panel.NodeID == "" {
		fmt.Println("  节点身份: 未注册（请执行 sparrow-agent register）")
	} else {
		fmt.Printf("  节点身份: %s\n", cfg.Panel.NodeID)
	}

	fmt.Println("== 内核 ==")
	if cfg.Core.Binary == "" {
		fmt.Println("  内核可执行文件: 未配置")
	} else if _, err := os.Stat(cfg.Core.Binary); err != nil {
		fmt.Printf("  内核可执行文件: 不可用 (%v)\n", err)
	} else {
		fmt.Printf("  内核可执行文件: %s\n", cfg.Core.Binary)
	}

	fmt.Println("== 数据目录 ==")
	if err := os.MkdirAll(cfg.Agent.DataDir, 0o755); err != nil {
		fmt.Printf("  数据目录: 不可用 (%v)\n", err)
	} else {
		fmt.Printf("  数据目录: %s\n", cfg.Agent.DataDir)
	}

	fmt.Println("== 面板连通性 ==")
	if cfg.Panel.NodeID == "" || cfg.Panel.NodeSecret == "" {
		fmt.Println("  跳过：尚未注册")
		return nil
	}
	api, err := client.New(client.Options{BaseURL: cfg.Panel.URL, NodeID: cfg.Panel.NodeID, Secret: cfg.Panel.NodeSecret})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := api.FetchConfig(ctx, 0); err != nil && !errors.Is(err, client.ErrNotModified) {
		fmt.Printf("  面板不可达: %v\n", err)
		return nil
	}
	fmt.Println("  面板可达")
	return nil
}

// newCore 按配置创建内核实现。
func newCore(cfg *config.Config, log *slog.Logger) (core.Core, error) {
	if cfg.Core.Type == "fake" {
		return core.NewFake(core.Options{}), nil
	}
	impl, err := core.New(core.Options{
		Type:       cfg.Core.Type,
		Binary:     cfg.Core.Binary,
		ConfigPath: cfg.Core.ConfigPath,
		ClashAPI:   cfg.Core.ClashAPI,
		Dir:        cfg.Agent.DataDir,
	})
	if err != nil {
		return nil, err
	}
	if setter, ok := impl.(interface{ SetLogger(*slog.Logger) }); ok {
		setter.SetLogger(log)
	}
	return impl, nil
}

// loadOrDefault 读取配置文件；文件不存在时返回默认配置。
func loadOrDefault(path string) (*config.Config, error) {
	cfg, err := config.Load(path)
	if err == nil {
		return cfg, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	cfg = config.Default()
	if err := cfg.ApplyEnv(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// hostname 返回本机主机名。
func hostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "unknown"
	}
	return name
}

// localIP 尽力而为地获取本机出口 IP。
func localIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:53")
	if err != nil {
		return ""
	}
	defer conn.Close()
	addr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok {
		return ""
	}
	return addr.IP.String()
}

// usage 打印用法。
func usage() {
	fmt.Fprintln(os.Stderr, `用法:
  sparrow-agent run [-c config.yaml]   前台运行
  sparrow-agent register               注册节点
  sparrow-agent status                 查看状态
  sparrow-agent config                 打印当前生效配置（脱敏）
  sparrow-agent doctor                 自检
  sparrow-agent update [--check]       自更新
  sparrow-agent version                版本信息`)
}

// placeholderNodeID 是注册接口使用的占位节点 ID（注册时尚未分配 node_id）。
const placeholderNodeID = "00000000-0000-0000-0000-000000000000"

// yamlMarshal 把配置序列化为 YAML。
func yamlMarshal(v any) ([]byte, error) {
	return yaml.Marshal(v)
}
