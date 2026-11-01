// Package agent 是 Agent 的主循环：心跳、配置拉取、流量上报、命令长轮询、内核守护。
//
// 设计要点：
//   - 每个循环独立退避：单次失败 1s→2s→…→max_backoff，成功一次立刻重置；
//   - seq / configVersion / coreVersion / backlog 落盘到 data_dir/state.json，重启不丢；
//   - SIGTERM 后在 30s 总预算内：停循环 → 刷流量 → 停内核。
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"sparrow/agent/internal/client"
	"sparrow/agent/internal/config"
	"sparrow/agent/internal/core"
	"sparrow/agent/internal/model"
	"sparrow/agent/internal/traffic"
	"sparrow/agent/internal/update"
)

// Deps 允许测试注入假面板客户端、假内核与临时目录的状态存储。
// 生产路径使用 New（全部按配置构造）。
type Deps struct {
	Client *client.Client
	Kernel core.Core
	Store  *Store
}

type Runner struct {
	cfg       *config.Config
	log       *slog.Logger
	client    *client.Client
	kernel    core.Core
	collector *traffic.Collector
	store     *Store

	// mu 保护以下字段：它们都需要与 state.json 保持一致。
	mu            sync.Mutex
	seq           int64
	configVersion int64
	coreVersion   string
	backlog       []model.TrafficItem

	// saveMu 保证「快照 + 写盘」的顺序，避免并发 Save 出现旧快照后写覆盖新状态。
	saveMu sync.Mutex
	// configMu 串行化配置拉取，避免心跳与配置循环同时 Apply 同一版本。
	configMu sync.Mutex

	startedAt time.Time
}

// New 按配置构造 Runner（真实内核 + 真实面板客户端 + 真实状态文件）。
func New(cfg *config.Config, log *slog.Logger) (*Runner, error) {
	return NewWithDeps(cfg, log, Deps{})
}

// NewWithDeps 允许注入依赖，测试不连真实面板/内核。
func NewWithDeps(cfg *config.Config, log *slog.Logger, deps Deps) (*Runner, error) {
	if log == nil {
		log = slog.Default()
	}

	kernel := deps.Kernel
	if kernel == nil {
		var err error
		kernel, err = core.New(cfg.Core.Type, core.Options{
			Binary:     cfg.Core.Binary,
			ConfigPath: cfg.Core.ConfigPath,
			WorkDir:    cfg.Agent.DataDir,
		})
		if err != nil {
			return nil, err
		}
	}

	panelClient := deps.Client
	if panelClient == nil {
		panelClient = client.New(cfg.Panel.URL, cfg.Panel.NodeID, cfg.Panel.NodeSecret, nil)
	}

	store := deps.Store
	if store == nil {
		store = NewStore(cfg.Agent.DataDir, log)
	}

	r := &Runner{
		cfg:       cfg,
		log:       log,
		client:    panelClient,
		kernel:    kernel,
		collector: traffic.NewCollector(),
		store:     store,
		startedAt: time.Now(),
	}

	state, err := store.Load()
	if err != nil {
		// 状态文件损坏不能阻止 Agent 启动：告警后用默认值，下次写入会覆盖。
		log.Warn("读取本地状态失败，使用默认值", "path", store.Path(), "err", err)
	}
	r.seq = state.Seq
	r.configVersion = state.ConfigVersion
	r.coreVersion = state.CoreVersion
	r.backlog = state.Backlog
	log.Info("已载入本地状态",
		"path", store.Path(),
		"seq", r.seq,
		"config_version", r.configVersion,
		"core_version", r.coreVersion,
		"backlog", len(r.backlog))
	return r, nil
}

// Run 启动五个循环并阻塞到 ctx 取消，随后优雅退出。
func (r *Runner) Run(ctx context.Context) error {
	r.log.Info("agent 启动",
		"panel", r.cfg.Panel.URL,
		"node_id", r.cfg.Panel.NodeID,
		"core", r.cfg.Core.Type,
		"heartbeat", r.cfg.Agent.HeartbeatInterval.Value().String(),
		"state_file", r.store.Path())

	if err := r.pullConfig(ctx); err != nil {
		r.log.Warn("首次拉取配置失败，继续用本地缓存", "err", err)
	}

	runCtx, cancel := context.WithCancel(ctx)
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
			r.withBackoff(runCtx, name, loop)
		}(name, loop)
	}

	<-runCtx.Done()
	r.log.Info("收到退出信号，停止所有循环", "loops", len(loops))
	wg.Wait()

	r.shutdown()
	return nil
}

// shutdown 在 30s 总预算内完成：刷一次流量 → 落盘状态 → 停止内核。
func (r *Runner) shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	r.log.Info("开始优雅退出", "timeout", "30s")
	if err := r.flushTraffic(ctx); err != nil {
		r.log.Warn("退出前刷流量失败，已保留在 backlog", "err", err)
	} else {
		r.log.Info("退出前流量已刷新")
	}

	r.saveState()

	if err := r.kernel.Stop(ctx); err != nil {
		r.log.Warn("停止内核失败", "err", err)
	} else {
		r.log.Info("内核已停止")
	}
	r.log.Info("agent 已退出")
}

/* ---------------- 状态读写（内存与 state.json 同步） ---------------- */

func (r *Runner) snapshot() State {
	r.mu.Lock()
	defer r.mu.Unlock()
	backlog := make([]model.TrafficItem, len(r.backlog))
	copy(backlog, r.backlog)
	return State{
		Seq:           r.seq,
		ConfigVersion: r.configVersion,
		CoreVersion:   r.coreVersion,
		Backlog:       backlog,
	}
}

func (r *Runner) saveState() {
	r.saveMu.Lock()
	defer r.saveMu.Unlock()
	if err := r.store.Save(r.snapshot()); err != nil {
		r.log.Warn("写入本地状态失败", "path", r.store.Path(), "err", err)
	}
}

// nextSeq 递增 seq 并立刻落盘：重启后不会复用 seq（面板按 seq 幂等）。
func (r *Runner) nextSeq() int64 {
	r.mu.Lock()
	r.seq++
	seq := r.seq
	r.mu.Unlock()
	r.saveState()
	return seq
}

func (r *Runner) currentSeq() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.seq
}

func (r *Runner) currentConfigVersion() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.configVersion
}

func (r *Runner) setConfigVersion(version int64) {
	r.mu.Lock()
	changed := r.configVersion != version
	r.configVersion = version
	r.mu.Unlock()
	if changed {
		r.saveState()
	}
}

func (r *Runner) currentCoreVersion() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.coreVersion
}

func (r *Runner) setCoreVersion(version string) {
	r.mu.Lock()
	changed := r.coreVersion != version
	r.coreVersion = version
	r.mu.Unlock()
	if changed {
		r.saveState()
	}
}

func (r *Runner) currentBacklog() []model.TrafficItem {
	r.mu.Lock()
	defer r.mu.Unlock()
	backlog := make([]model.TrafficItem, len(r.backlog))
	copy(backlog, r.backlog)
	return backlog
}

func (r *Runner) setBacklog(items []model.TrafficItem) {
	if items == nil {
		items = []model.TrafficItem{}
	}
	kept, dropped := traffic.TrimBacklog(items, traffic.MaxBacklog)
	if dropped > 0 {
		r.log.Warn("backlog 超过上限，丢弃最旧条目", "dropped", dropped, "limit", traffic.MaxBacklog)
	}
	r.mu.Lock()
	r.backlog = kept
	r.mu.Unlock()
	r.saveState()
}

/* ---------------- 循环骨架 ---------------- */

// minIdleInterval 是没有显式间隔的循环（命令长轮询）在面板秒回时的最小空转间隔。
const minIdleInterval = 100 * time.Millisecond

func (r *Runner) heartbeatLoop(ctx context.Context) {
	r.runLoop(ctx, "heartbeat", r.cfg.Agent.HeartbeatInterval.Value(), r.heartbeatTick)
}

func (r *Runner) configLoop(ctx context.Context) {
	r.runLoop(ctx, "config", r.cfg.Agent.ConfigPollInterval.Value(), r.pullConfig)
}

func (r *Runner) trafficLoop(ctx context.Context) {
	r.runLoop(ctx, "traffic", r.cfg.Agent.HeartbeatInterval.Value(), r.flushTraffic)
}

func (r *Runner) commandLoop(ctx context.Context) {
	r.runLoop(ctx, "command", 0, r.commandTick)
}

func (r *Runner) superviseLoop(ctx context.Context) {
	r.runLoop(ctx, "supervise", 15*time.Second, r.superviseTick)
}

// runLoop 在循环内部处理失败退避：失败后 1s→2s→…→max_backoff，成功一次立即重置。
// 这是本次加固的关键——旧实现只在循环返回后才退避，单次请求失败会等到下一个 tick。
func (r *Runner) runLoop(ctx context.Context, name string, interval time.Duration, tick func(context.Context) error) {
	backoff := time.Second
	maxBackoff := r.cfg.Agent.MaxBackoff.Value()
	if maxBackoff < time.Second {
		maxBackoff = time.Second
	}

	for {
		if ctx.Err() != nil {
			return
		}

		err := r.runTick(ctx, name, tick)
		wait := interval
		switch {
		case err != nil && ctx.Err() == nil:
			r.logLoopError(name, err)
			wait = backoff
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		case err != nil:
			return // 取消导致的错误，直接退出
		default:
			backoff = time.Second
		}

		if wait <= 0 {
			wait = minIdleInterval
		}
		if !sleepCtx(ctx, wait) {
			return
		}
	}
}

// runTick 把 panic 转成错误，避免一个循环挂了整个进程。
func (r *Runner) runTick(ctx context.Context, name string, tick func(context.Context) error) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("%s 循环 panic: %v", name, rec)
		}
	}()
	return tick(ctx)
}

// logLoopError 按错误类型分级别：面板 4xx 用 warn；网络抖动用 debug（交给退避）；
// 只有真正的内部错误（配置应用失败、内核重启失败等）才用 error。
func (r *Runner) logLoopError(name string, err error) {
	if apiErr, ok := client.AsAPIError(err); ok {
		r.log.Warn("面板拒绝请求，按退避重试",
			"loop", name, "code", apiErr.Code, "status", apiErr.StatusCode, "err", err)
		return
	}
	if client.IsNetworkError(err) {
		r.log.Debug("网络错误，按退避重试", "loop", name, "err", err)
		return
	}
	r.log.Error("循环失败，按退避重试", "loop", name, "err", err)
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return true
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// withBackoff 是循环的最后防线：循环正常返回只可能是 ctx 结束；
// 若因 panic 退出，按指数退避重启该循环（常规失败的退避在 runLoop 内部完成）。
func (r *Runner) withBackoff(ctx context.Context, name string, loop func(context.Context)) {
	backoff := time.Second
	maxBackoff := r.cfg.Agent.MaxBackoff.Value()
	if maxBackoff < time.Second {
		maxBackoff = time.Second
	}

	for {
		recovered := false
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					recovered = true
					r.log.Error("循环 panic，准备重启", "loop", name, "panic", rec)
				}
			}()
			loop(ctx)
		}()

		if ctx.Err() != nil {
			return
		}
		if !recovered {
			r.log.Warn("循环意外退出", "loop", name)
			return
		}
		if !sleepCtx(ctx, backoff) {
			return
		}
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

/* ---------------- 各循环的单次执行 ---------------- */

func (r *Runner) heartbeatTick(ctx context.Context) error {
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
		return err
	}
	r.log.Debug("心跳成功", "config_version", resp.ConfigVersion, "min_agent", resp.MinAgentVersion)

	if int64(resp.ConfigVersion) > r.currentConfigVersion() {
		if err := r.pullConfig(ctx); err != nil {
			r.log.Warn("心跳提示有新配置，拉取失败", "err", err)
		}
	}
	return nil
}

func (r *Runner) pullConfig(ctx context.Context) error {
	// 心跳与配置循环可能同时触发拉取：串行化，第二次会带已更新的版本号命中 304。
	r.configMu.Lock()
	defer r.configMu.Unlock()

	resp, notModified, err := r.client.FetchConfig(ctx, int(r.currentConfigVersion()))
	if err != nil {
		return err
	}
	if notModified || resp == nil {
		r.log.Debug("配置未变化（304）", "version", r.currentConfigVersion())
		return nil
	}

	if err := r.applyConfig(ctx, resp); err != nil {
		r.log.Error("应用配置失败，保留旧配置", "err", err, "version", resp.Version)
		return err
	}

	r.setConfigVersion(int64(resp.Version))
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
	// 配置变更后内核统计基线失效，必须 Reset 否则下次增量会算成负数/重复。
	r.collector.Reset()
	return nil
}

func (r *Runner) flushTraffic(ctx context.Context) error {
	items, err := r.collector.Collect(ctx, r.kernel)
	if err != nil {
		return err
	}

	merged := traffic.Merge(r.currentBacklog(), items)
	if len(merged) == 0 {
		return nil
	}

	// 先递增并落盘 seq，再上报：进程被杀也不会复用 seq。
	seq := r.nextSeq()
	result, err := r.client.ReportTraffic(ctx, model.TrafficReport{Seq: seq, Items: merged})
	if err != nil {
		// 失败进 backlog 并落盘，恢复后合并重发。
		r.setBacklog(merged)
		return err
	}

	r.setBacklog(nil)
	if result != nil {
		r.log.Info("流量已上报", "seq", result.Seq, "accepted", result.Accepted, "duplicate", result.Duplicate, "items", len(merged))
	}
	return nil
}

func (r *Runner) commandTick(ctx context.Context) error {
	commands, err := r.client.FetchCommands(ctx, r.cfg.Agent.CommandPollTimeout.Value())
	if err != nil {
		return err
	}
	for _, cmd := range commands {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		r.execCommand(ctx, cmd)
	}
	return nil
}

func (r *Runner) execCommand(ctx context.Context, cmd model.Command) {
	ack := model.CommandAck{Status: "success"}
	var result any

	switch cmd.Command {
	case "reload_config", "sync_now":
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
	case "set_log_level":
		r.log.Info("收到 set_log_level，当前实现需重启生效")
		result = map[string]string{"note": "日志级别变更需重启生效"}
	case "upgrade_core":
		// 内核升级需要面板下发二进制并校验，当前未实现，明确回执而不是静默成功。
		ack.Status = "failed"
		result = map[string]string{"error": "upgrade_core 未实现：内核升级需由面板下发二进制并校验（见 docs/architecture/agent-cli.md §9）"}
	case "update_agent":
		release, err := update.Check(ctx, r.cfg)
		if err != nil {
			ack.Status = "failed"
			result = map[string]string{"error": err.Error()}
			break
		}
		result = map[string]string{
			"currentVersion": update.CurrentVersion(),
			"latestVersion":  release.Version,
			"note":           "自更新下载与替换尚未实现，请手工升级",
		}
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
		return
	}
	r.log.Info("命令已执行并回执", "command", cmd.Command, "status", ack.Status)
}

func (r *Runner) superviseTick(ctx context.Context) error {
	if !r.kernel.Alive(ctx) {
		r.log.Warn("内核进程不在运行，尝试重启")
		if err := r.kernel.Restart(ctx); err != nil {
			return fmt.Errorf("重启内核失败: %w", err)
		}
		// 内核重启后累计流量归零，基线必须重置。
		r.collector.Reset()
		r.log.Info("内核已重启")
	}

	version, err := r.kernel.Version(ctx)
	if err != nil {
		r.log.Debug("读取内核版本失败", "err", err)
		return nil
	}
	r.setCoreVersion(version)
	return nil
}

// Status 供本地 /metrics 与 /healthz 使用（运行中的内存视图）。
// `sparrow-agent status` 子命令走 LocalStatus（读 state.json，不依赖进程内状态）。
func (r *Runner) Status(ctx context.Context) map[string]any {
	return map[string]any{
		"panel":         r.cfg.Panel.URL,
		"nodeId":        r.cfg.Panel.NodeID,
		"core":          r.kernel.Name(),
		"coreAlive":     r.kernel.Alive(ctx),
		"configVersion": r.currentConfigVersion(),
		"coreVersion":   r.currentCoreVersion(),
		"trafficSeq":    r.currentSeq(),
		"backlog":       len(r.currentBacklog()),
		"uptimeSeconds": int(time.Since(r.startedAt).Seconds()),
	}
}
