package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"sparrow/agent/internal/agent"
	"sparrow/agent/internal/client"
	"sparrow/agent/internal/config"
	"sparrow/agent/internal/health"
	"sparrow/agent/internal/logger"
	"sparrow/agent/internal/model"
	"sparrow/agent/internal/update"
)

const defaultConfigPath = "/etc/sparrow-agent/config.yaml"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "run":
		err = cmdRun(os.Args[2:])
	case "register":
		err = cmdRegister(os.Args[2:])
	case "status":
		err = cmdStatus(os.Args[2:])
	case "config":
		err = cmdConfig(os.Args[2:])
	case "doctor":
		err = cmdDoctor(os.Args[2:])
	case "update":
		err = cmdUpdate(os.Args[2:])
	case "version", "-v", "--version":
		fmt.Printf("sparrow-agent %s (%s/%s, go %s)\n", model.Version, runtime.GOOS, runtime.GOARCH, runtime.Version())
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "未知子命令 %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `sparrow-agent —— 节点侧代理程序

用法:
  sparrow-agent run [-c config.yaml]              前台运行（systemd ExecStart）
  sparrow-agent register --url URL --token TOKEN  注册节点并写入配置
  sparrow-agent status [-c config.yaml]           本地状态
  sparrow-agent config [-c config.yaml]           打印生效配置（密钥脱敏）
  sparrow-agent doctor [-c config.yaml]           自检：配置 / 内核 / 面板连通性
  sparrow-agent update [--check]                 自更新
  sparrow-agent version                           版本信息
`)
}

func cmdRun(args []string) error {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	if !cfg.Registered() {
		return fmt.Errorf("尚未注册：先执行 sparrow-agent register --url <panel> --token <token>")
	}

	log, closer, err := logger.New(cfg.Agent.LogLevel, cfg.Agent.LogFile)
	if err != nil {
		return err
	}
	defer closer.Close()

	runner, err := agent.New(cfg, log)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if os.Getenv("SPARROW_METRICS_ADDR") != "" {
		go func() {
			_ = health.Serve(ctx, os.Getenv("SPARROW_METRICS_ADDR"), func(ctx context.Context) map[string]any {
				return runner.Status(ctx)
			})
		}()
	}

	return runner.Run(ctx)
}

func cmdRegister(args []string) error {
	fs := flag.NewFlagSet("register", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	panelURL := fs.String("url", "", "面板地址（省略时用配置文件里 panel.url）")
	token := fs.String("token", "", "管理端生成的一次性注册令牌")
	_ = fs.Parse(args)

	if *token == "" {
		return fmt.Errorf("--token 是必填（面板「节点管理 → 新建节点」里的一次性令牌）")
	}

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	// --url 可省略：配置文件里已写 panel.url 时直接复用
	if *panelURL != "" {
		cfg.Panel.URL = *panelURL
	}
	if cfg.Panel.URL == "" {
		return fmt.Errorf("缺少面板地址：加 --url https://你的面板域名，或在 %s 里设置 panel.url", cfg.Path())
	}

	hostname, _ := os.Hostname()
	c := client.New(cfg.Panel.URL, "", "", nil)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	resp, err := c.Register(ctx, *token, model.RegisterRequest{
		Hostname:     hostname,
		AgentVersion: model.Version,
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
	})
	if err != nil {
		return err
	}

	if err := cfg.Save(resp.NodeID, resp.NodeSecret); err != nil {
		return fmt.Errorf("注册成功但写入配置失败: %w", err)
	}

	fmt.Printf("注册成功\n  node_id: %s\n  配置已写入: %s\n  心跳间隔: %ds\n",
		resp.NodeID, cfg.Path(), resp.HeartbeatInterval)
	return nil
}

func cmdStatus(args []string) error {
	fs := flag.NewFlagSet("status", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	// 不连面板：只读 data_dir/state.json + 探测内核进程，面板不可达时也能用。
	out := agent.LocalStatus(cfg)
	encoded, _ := json.MarshalIndent(out, "", "  ")
	fmt.Println(string(encoded))
	return nil
}

func cmdConfig(args []string) error {
	fs := flag.NewFlagSet("config", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	cfg.Panel.NodeSecret = "••••••••"
	encoded, _ := json.MarshalIndent(cfg, "", "  ")
	fmt.Println(string(encoded))
	return nil
}

func cmdDoctor(args []string) error {
	fs := flag.NewFlagSet("doctor", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	checks := health.Run(ctx, cfg)
	failed := 0
	for _, check := range checks {
		mark := "✓"
		if !check.OK {
			mark = "✗"
			failed++
		}
		fmt.Printf("%s %-14s %s\n", mark, check.Name, check.Detail)
	}
	if failed > 0 {
		return fmt.Errorf("%d 项检查未通过", failed)
	}
	return nil
}

func cmdUpdate(args []string) error {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	path := fs.String("c", defaultConfigPath, "配置文件路径")
	checkOnly := fs.Bool("check", false, "只检查是否有新版本")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	release, err := update.Check(ctx, cfg)
	if err != nil {
		return err
	}
	if *checkOnly {
		fmt.Printf("当前版本 %s，最新版本 %s\n", update.CurrentVersion(), release.Version)
		return nil
	}

	current, err := os.Executable()
	if err != nil {
		return err
	}
	if err := update.Apply(ctx, cfg, current, release); err != nil {
		return err
	}
	fmt.Printf("已更新到 %s，请重启服务\n", release.Version)
	return nil
}
