// Package agent 实现节点端的主循环。
//
// 四个互相独立的 goroutine，各自指数退避重连，互不阻塞：
//   - 心跳：每 30s POST /api/v1/agent/heartbeat
//   - 配置轮询：每 300s GET /api/v1/agent/config（带 X-Config-Version，304 跳过）
//   - 流量上报：每 30s POST /api/v1/agent/traffic（只上报增量，失败进本地环形缓冲）
//   - 命令长轮询：GET /api/v1/agent/commands（最长 25s），执行后 ack
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/sparrows/sparrow-agent/internal/cache"
	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/config"
	"github.com/sparrows/sparrow-agent/internal/core"
	"github.com/sparrows/sparrow-agent/internal/health"
	"github.com/sparrows/sparrow-agent/internal/metrics"
	"github.com/sparrows/sparrow-agent/internal/traffic"
	"github.com/sparrows/sparrow-agent/internal/version"
)

// Options 是 Agent 的构造参数。
type Options struct {
	// Config 节点配置
	Config *config.Config
	// Client 面板客户端
	Client *client.AgentClient
	// Core 内核实现
	Core core.Core
	// Logger 日志器
	Logger *slog.Logger
	// Metrics 指标注册表
	Metrics *metrics.Registry
	// Cache 配置缓存（离线容错）
	Cache *cache.Cache
	// LevelVar 动态日志级别（可选，支持 set_log_level 命令）
	LevelVar *slog.LevelVar
}

// Agent 是节点端运行时。
type Agent struct {
	cfg     *config.Config
	api     *client.AgentClient
	core    core.Core
	log     *slog.Logger
	metrics *metrics.Registry
	cache   *cache.Cache

	agg    *traffic.Aggregator
	outbox *traffic.Outbox

	// levelVar 用于运行时调整日志级别
	levelVar *slog.LevelVar

	mu            sync.RWMutex
	configVersion int64
	panelOnline   bool
	coreAlive     bool
	startedAt     time.Time

	// configWake 用于在心跳发现配置版本变化时，提前唤醒配置轮询。
	configWake chan struct{}
}

// New 创建 Agent。
func New(opts Options) (*Agent, error) {
	if opts.Config == nil {
		return nil, errors.New("agent: 缺少配置")
	}
	if opts.Client == nil {
		return nil, errors.New("agent: 缺少面板客户端")
	}
	if opts.Core == nil {
		return nil, errors.New("agent: 缺少内核实现")
	}
	log := opts.Logger
	if log == nil {
		log = slog.Default()
	}
	reg := opts.Metrics
	if reg == nil {
		reg = metrics.New()
	}
	cfg := opts.Config
	if err := os.MkdirAll(cfg.Agent.DataDir, 0o755); err != nil {
		return nil, fmt.Errorf("agent: 创建数据目录失败: %w", err)
	}
	state, err := traffic.LoadState(cfg.TrafficStateFile())
	if err != nil {
		log.Warn("读取流量状态失败，按空状态启动", "error", err.Error())
		state = &traffic.State{Last: map[int64]core.UserStat{}}
	}
	outbox, err := traffic.NewOutbox(cfg.TrafficOutboxFile(), cfg.Agent.TrafficBufferSize)
	if err != nil {
		log.Warn("读取流量补报队列失败，按空队列启动", "error", err.Error())
		outbox, _ = traffic.NewOutbox("", cfg.Agent.TrafficBufferSize)
	}
	agg := traffic.NewAggregator()
	agg.Restore(state.Last)

	a := &Agent{
		cfg:        cfg,
		api:        opts.Client,
		core:       opts.Core,
		log:        log,
		metrics:    reg,
		cache:      opts.Cache,
		agg:        agg,
		outbox:     outbox,
		levelVar:   opts.LevelVar,
		startedAt:  time.Now(),
		configWake: make(chan struct{}, 1),
	}
	a.registerMetrics()
	return a, nil
}

// registerMetrics 声明并初始化指标。
func (a *Agent) registerMetrics() {
	a.metrics.SetHelp("sparrow_agent_heartbeat_total", "心跳请求总数")
	a.metrics.SetHelp("sparrow_agent_traffic_report_total", "流量上报请求总数")
	a.metrics.SetHelp("sparrow_agent_config_version", "当前生效的内核配置版本")
	a.metrics.SetHelp("sparrow_agent_core_alive", "内核进程是否存活（1/0）")
	a.metrics.SetHelp("sparrow_agent_panel_connected", "与面板的连接状态（1/0）")
	a.metrics.SetHelp("sparrow_agent_traffic_outbox_size", "待补报的流量记录条数")
	a.metrics.SetHelp("sparrow_agent_traffic_bytes_total", "累计上报的流量字节数")
	a.metrics.SetHelp("sparrow_agent_command_total", "命令处理总数")
	a.metrics.SetHelp("sparrow_agent_up", "Agent 是否正常运行（1/0）")

	a.metrics.Set("sparrow_agent_config_version", nil, 0)
	a.metrics.Set("sparrow_agent_core_alive", nil, 0)
	a.metrics.Set("sparrow_agent_panel_connected", nil, 0)
	a.metrics.Set("sparrow_agent_traffic_outbox_size", nil, 0)
	a.metrics.Set("sparrow_agent_up", nil, 1)
}

// Run 启动 Agent 并阻塞，直到 ctx 被取消。
func (a *Agent) Run(ctx context.Context) error {
	defer a.metrics.Set("sparrow_agent_up", nil, 0)

	// 离线容错：面板不可达时，先用本地缓存的最后一次配置继续服务。
	if err := a.applyCachedConfig(ctx); err != nil {
		a.log.Warn("应用本地缓存配置失败，等待面板下发", "error", err.Error())
	}

	if starter, ok := a.core.(interface{ Start(context.Context) error }); ok {
		if err := starter.Start(ctx); err != nil {
			a.log.Error("启动内核失败", "error", err.Error())
		}
	}

	var wg sync.WaitGroup
	wg.Add(4)
	go func() {
		defer wg.Done()
		a.heartbeatLoop(ctx)
	}()
	go func() {
		defer wg.Done()
		a.configLoop(ctx)
	}()
	go func() {
		defer wg.Done()
		a.trafficLoop(ctx)
	}()
	go func() {
		defer wg.Done()
		a.commandLoop(ctx)
	}()

	<-ctx.Done()
	a.log.Info("收到停止信号，准备退出")
	wg.Wait()

	// 优雅退出：刷一次流量 → 停内核
	flushCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := a.flushTraffic(flushCtx); err != nil {
		a.log.Warn("退出前刷流量失败", "error", err.Error())
	}
	if err := a.core.Close(); err != nil {
		a.log.Warn("停止内核失败", "error", err.Error())
	}
	return nil
}

// State 返回当前状态（供 /healthz 使用）。
func (a *Agent) State() health.State {
	a.mu.RLock()
	defer a.mu.RUnlock()
	coreState := "dead"
	if a.coreAlive {
		coreState = "alive"
	}
	panelState := "disconnected"
	if a.panelOnline {
		panelState = "connected"
	}
	return health.State{
		OK:            true,
		Core:          coreState,
		Panel:         panelState,
		ConfigVersion: a.configVersion,
		AgentVersion:  version.Version,
	}
}

// setPanelOnline 记录面板连通性。
func (a *Agent) setPanelOnline(online bool) {
	a.mu.Lock()
	a.panelOnline = online
	a.mu.Unlock()
	a.metrics.Set("sparrow_agent_panel_connected", nil, boolValue(online))
}

// setConfigVersion 记录当前配置版本。
func (a *Agent) setConfigVersion(v int64) {
	a.mu.Lock()
	a.configVersion = v
	a.mu.Unlock()
	a.metrics.Set("sparrow_agent_config_version", nil, float64(v))
}

// configVersionValue 返回当前配置版本。
func (a *Agent) configVersionValue() int64 {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.configVersion
}

// setCoreAlive 记录内核存活状态。
func (a *Agent) setCoreAlive(alive bool) {
	a.mu.Lock()
	a.coreAlive = alive
	a.mu.Unlock()
	a.metrics.Set("sparrow_agent_core_alive", nil, boolValue(alive))
}

// wakeConfig 提前唤醒配置轮询。
func (a *Agent) wakeConfig() {
	select {
	case a.configWake <- struct{}{}:
	default:
	}
}

// setLogLevel 动态调整日志级别。
func (a *Agent) setLogLevel(level slog.Level) error {
	if a.levelVar == nil {
		return errors.New("当前日志器不支持动态调整级别")
	}
	a.levelVar.Set(level)
	a.log.Info("日志级别已调整", "level", level.String())
	return nil
}

// backoff 是指数退避器（30s → 1m → 2m…，上限 maxBackoff）。
type backoff struct {
	base    time.Duration
	max     time.Duration
	attempt int
}

// newBackoff 创建退避器。
func newBackoff(base, max time.Duration) *backoff {
	if max <= 0 {
		max = 5 * time.Minute
	}
	return &backoff{base: base, max: max}
}

// next 返回下一次等待时长并累加重试次数。
func (b *backoff) next() time.Duration {
	delay := b.base
	for i := 0; i < b.attempt; i++ {
		delay *= 2
		if delay >= b.max {
			b.attempt++
			return b.max
		}
	}
	b.attempt++
	if delay > b.max {
		return b.max
	}
	return delay
}

// reset 重置退避计数。
func (b *backoff) reset() { b.attempt = 0 }

// sleep 等待一段时间；ctx 取消时立即返回 false。
func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// boolValue 把布尔转成 1/0。
func boolValue(v bool) float64 {
	if v {
		return 1
	}
	return 0
}

// bundleFromConfig 把面板的配置响应转换成内核配置包。
func bundleFromConfig(resp *client.AgentConfigResponse) (*core.Bundle, error) {
	if resp == nil {
		return nil, errors.New("agent: 配置响应为空")
	}
	raw, err := json.Marshal(resp.Config)
	if err != nil {
		return nil, fmt.Errorf("agent: 序列化内核配置失败: %w", err)
	}
	config := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &config); err != nil {
			return nil, fmt.Errorf("agent: 解析内核配置失败: %w", err)
		}
	}
	bundle := &core.Bundle{
		Version: resp.Version,
		Core:    string(resp.Core),
		Config:  config,
		Reload:  resp.Reload,
	}
	for _, u := range resp.Rules.Users {
		bundle.Rules = append(bundle.Rules, core.UserRule{
			Email:         u.Email,
			Uid:           u.Uid,
			Limit:         u.Limit,
			DownloadSpeed: u.DownloadSpeed,
			UploadSpeed:   u.UploadSpeed,
			DeviceLimit:   u.DeviceLimit,
			Enabled:       u.Enabled,
		})
	}
	for _, c := range resp.Certificates {
		bundle.Certificates = append(bundle.Certificates, core.Certificate{
			Name: c.Name,
			Cert: c.Cert,
			Key:  c.Key,
		})
	}
	return bundle, nil
}
