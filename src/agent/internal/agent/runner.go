// Package agent 是 Agent 的主循环：心跳、配置拉取、流量上报、命令长轮询、内核守护。
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"sparrow/agent/internal/client"
	"sparrow/agent/internal/config"
	"sparrow/agent/internal/core"
	"sparrow/agent/internal/model"
	"sparrow/agent/internal/traffic"
)

type Runner struct {
	cfg       *config.Config
	log       *slog.Logger
	client    *client.Client
	kernel    core.Core
	collector *traffic.Collector

	seq     atomic.Int64
	backlog atomic.Value // []model.TrafficItem，上报失败时暂存

	configVersion atomic.Int64
	coreVersion   atomic.Value // string
	startedAt     time.Time
}

func New(cfg *config.Config, log *slog.Logger) (*Runner, error) {
	kernel, err := core.New(cfg.Core.Type, core.Options{
		Binary:     cfg.Core.Binary,
		ConfigPath: cfg.Core.ConfigPath,
		WorkDir:    cfg.Agent.DataDir,
	})
	if err != nil {
		return nil, err
	}

	r := &Runner{
		cfg:       cfg,
		log:       log,
		client:    client.New(cfg.Panel.URL, cfg.Panel.NodeID, cfg.Panel.NodeSecret, nil),
		kernel:    kernel,
		collector: traffic.NewCollector(),
		startedAt: time.Now(),
	}
	r.backlog.Store([]model.TrafficItem{})
	r.coreVersion.Store("")
	// -1 保证首次拉取不会命中面板的 304 分支（面板 configVersion 从 0 开始）
	r.configVersion.Store(-1)
	return r, nil
}

// Run 启动四个循环并阻塞到 ctx 取消，随后优雅退出。
func (r *Runner) Run(ctx context.Context) error {
	r.log.Info("agent 启动",
		"panel", r.cfg.Panel.URL,
		"node_id", r.cfg.Panel.NodeID,
		"core", r.cfg.Core.Type,
		"heartbeat", r.cfg.Agent.HeartbeatInterval.Value().String())

	if err := r.pullConfig(ctx); err != nil {
		r.log.Warn("首次拉取配置失败，继续用本地缓存", "err", err)
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	loops := map[string]func(context.Context){
		"heartbeat": r.heartbeatLoop,
		"config":    r.configLoop,
		"traffic":   r.trafficLoop,
		"command":   r.commandLoop,
		"supervise": r.superviseLoop,
	}
	for name, loop := range loops {
		wg.Add(1)
		go func(name string, loop func(context.Context)) {
			defer wg.Done()
			r.withBackoff(ctx, name, loop)
		}(name, loop)
	}

	<-ctx.Done()
	r.log.Info("收到退出信号，开始清理")
	wg.Wait()

	// 退出前尽力刷一次流量
	flushCtx, flushCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer flushCancel()
	if err := r.flushTraffic(flushCtx); err != nil {
		r.log.Warn("退出前刷流量失败", "err", err)
	}

	stopCtx, stopCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer stopCancel()
	if err := r.kernel.Stop(stopCtx); err != nil {
		r.log.Warn("停止内核失败", "err", err)
	}
	r.log.Info("agent 已退出")
	return nil
}

/* ---------------- 各循环 ---------------- */

func (r *Runner) heartbeatLoop(ctx context.Context) {
	interval := r.cfg.Agent.HeartbeatInterval.Value()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	r.sendHeartbeat(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.sendHeartbeat(ctx)
		}
	}
}

func (r *Runner) sendHeartbeat(ctx context.Context) {
	req := model.HeartbeatRequest{
		Status:       "online",
		OnlineUsers:  0,
		AgentVersion: model.Version,
		Core:         r.kernel.Name(),
		CoreVersion:  r.currentCoreVersion(),
		ReportedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	if users, err := r.kernel.OnlineUsers(ctx); err == nil {
		req.OnlineUsers = users
	}
	if !r.kernel.Alive(ctx) {
		req.Status = "offline"
	}

	resp, err := r.client.Heartbeat(ctx, req)
	if err != nil {
		r.log.Warn("心跳失败", "err", err)
		return
	}
	r.log.Debug("心跳成功", "config_version", resp.ConfigVersion, "min_agent", resp.MinAgentVersion)

	if resp.ConfigVersion > int(r.configVersion.Load()) {
		if err := r.pullConfig(ctx); err != nil {
			r.log.Warn("心跳提示有新配置，拉取失败", "err", err)
		}
	}
}

func (r *Runner) configLoop(ctx context.Context) {
	interval := r.cfg.Agent.ConfigPollInterval.Value()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.pullConfig(ctx); err != nil {
				r.log.Warn("拉取配置失败", "err", err)
			}
		}
	}
}

func (r *Runner) pullConfig(ctx context.Context) error {
	resp, notModified, err := r.client.FetchConfig(ctx, int(r.configVersion.Load()))
	if err != nil {
		return err
	}
	if notModified {
		return nil
	}
	if resp == nil {
		return nil
	}

	if err := r.applyConfig(ctx, resp); err != nil {
		r.log.Error("应用配置失败，保留旧配置", "err", err, "version", resp.Version)
		return err
	}

	r.configVersion.Store(int64(resp.Version))
	r.log.Info("配置已应用", "version", resp.Version, "users", len(resp.Rules.Users))
	return nil
}

func (r *Runner) applyConfig(ctx context.Context, resp *model.ConfigResponse) error {
	if len(resp.Config) == 0 {
		return errors.New("下发的配置为空")
	}
	if err := r.kernel.Apply(ctx, resp.Config); err != nil {
		return err
	}
	r.collector.Reset() // 配置变更后统计基线失效
	return nil
}

func (r *Runner) trafficLoop(ctx context.Context) {
	interval := r.cfg.Agent.HeartbeatInterval.Value()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.flushTraffic(ctx); err != nil {
				r.log.Warn("上报流量失败，暂存到 backlog", "err", err)
			}
		}
	}
}

func (r *Runner) flushTraffic(ctx context.Context) error {
	items, err := r.collector.Collect(ctx, r.kernel)
	if err != nil {
		return err
	}

	backlog, _ := r.backlog.Load().([]model.TrafficItem)
	items = traffic.Merge(backlog, items)
	if len(items) == 0 {
		return nil
	}

	seq := r.seq.Add(1)
	result, err := r.client.ReportTraffic(ctx, model.TrafficReport{Seq: seq, Items: items})
	if err != nil {
		r.backlog.Store(items)
		return err
	}
	r.backlog.Store([]model.TrafficItem{})
	r.log.Debug("流量已上报", "seq", result.Seq, "accepted", result.Accepted, "duplicate", result.Duplicate)
	return nil
}

func (r *Runner) commandLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		commands, err := r.client.FetchCommands(ctx, r.cfg.Agent.CommandPollTimeout.Value())
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			r.log.Debug("拉取命令失败", "err", err)
			time.Sleep(2 * time.Second)
			continue
		}

		for _, cmd := range commands {
			r.execCommand(ctx, cmd)
		}
	}
}

func (r *Runner) execCommand(ctx context.Context, cmd model.Command) {
	ack := model.CommandAck{Status: "success"}
	var result any

	switch cmd.Command {
	case "reload_config":
		if err := r.pullConfig(ctx); err != nil {
			ack.Status = "failed"
			result = map[string]string{"error": err.Error()}
		}
	case "restart_core":
		if err := r.kernel.Restart(ctx); err != nil {
			ack.Status = "failed"
			result = map[string]string{"error": err.Error()}
		}
		r.collector.Reset()
	case "sync_now":
		if err := r.pullConfig(ctx); err != nil {
			ack.Status = "failed"
			result = map[string]string{"error": err.Error()}
		}
	case "set_log_level":
		r.log.Info("收到 set_log_level，当前实现需重启生效")
	default:
		ack.Status = "failed"
		result = map[string]string{"error": fmt.Sprintf("未知命令 %s", cmd.Command)}
	}

	if result != nil {
		if raw, err := json.Marshal(result); err == nil {
			ack.Result = raw
		}
	}
	if err := r.client.AckCommand(ctx, cmd.ID, ack); err != nil {
		r.log.Warn("命令回执失败", "command", cmd.Command, "err", err)
	}
}

func (r *Runner) superviseLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !r.kernel.Alive(ctx) {
				r.log.Warn("内核进程不在运行，尝试重启")
				if err := r.kernel.Restart(ctx); err != nil {
					r.log.Error("重启内核失败", "err", err)
					continue
				}
				r.collector.Reset()
			}
			if version, err := r.kernel.Version(ctx); err == nil {
				r.coreVersion.Store(version)
			}
		}
	}
}

// withBackoff 让单个循环崩溃后按指数退避重启，不影响其他循环。
func (r *Runner) withBackoff(ctx context.Context, name string, loop func(context.Context)) {
	backoff := time.Second
	maxBackoff := r.cfg.Agent.MaxBackoff.Value()

	for {
		if ctx.Err() != nil {
			return
		}
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					r.log.Error("循环 panic", "loop", name, "panic", rec)
				}
			}()
			loop(ctx)
		}()

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (r *Runner) currentCoreVersion() string {
	if v, ok := r.coreVersion.Load().(string); ok {
		return v
	}
	return ""
}

// Status 供 `sparrow-agent status` 使用。
func (r *Runner) Status(ctx context.Context) map[string]any {
	return map[string]any{
		"panel":          r.cfg.Panel.URL,
		"nodeId":         r.cfg.Panel.NodeID,
		"core":           r.kernel.Name(),
		"coreAlive":      r.kernel.Alive(ctx),
		"configVersion":  r.configVersion.Load(),
		"trafficSeq":     r.seq.Load(),
		"uptimeSeconds":  int(time.Since(r.startedAt).Seconds()),
	}
}
