package agent

import (
	"context"
	"time"

	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/version"
)

// heartbeatLoop 心跳循环：每 30s 上报一次状态；失败时指数退避重试。
func (a *Agent) heartbeatLoop(ctx context.Context) {
	interval := a.cfg.Agent.HeartbeatInterval.Duration()
	bo := newBackoff(interval, a.cfg.Agent.MaxBackoff.Duration())

	for {
		err := a.heartbeatOnce(ctx)
		wait := interval
		if err != nil {
			a.log.Warn("心跳失败", "error", err.Error())
			a.metrics.Inc("sparrow_agent_heartbeat_total", map[string]string{"result": "failure"})
			a.setPanelOnline(false)
			wait = bo.next()
		} else {
			a.metrics.Inc("sparrow_agent_heartbeat_total", map[string]string{"result": "success"})
			a.setPanelOnline(true)
			bo.reset()
		}
		if !sleep(ctx, wait) {
			return
		}
	}
}

// heartbeatOnce 上报一次心跳。
func (a *Agent) heartbeatOnce(ctx context.Context) error {
	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	stats, statsErr := a.core.Stats(reqCtx)
	if statsErr != nil {
		a.log.Debug("采集内核统计失败，心跳将不带流量数据", "error", statsErr.Error())
	}

	req := client.AgentHeartbeatRequest{
		Status:       "online",
		AgentVersion: version.Version,
		ReportedAt:   time.Now().UTC(),
		NetRx:        int64(stats.TotalDownload),
		NetTx:        int64(stats.TotalUpload),
	}
	if !a.core.Alive() {
		req.Status = "degraded"
	}
	if stats.OnlineUsers > 0 {
		online := int64(stats.OnlineUsers)
		req.OnlineUsers = &online
	}
	if cpu := cpuUsagePercent(); cpu >= 0 {
		value := float32(cpu)
		req.Cpu = &value
	}
	if memory := memoryUsagePercent(); memory >= 0 {
		value := float32(memory)
		req.Memory = &value
	}
	if disk := diskUsagePercent(a.cfg.Agent.DataDir); disk >= 0 {
		value := float32(disk)
		req.Disk = &value
	}
	if coreType := a.cfg.Core.Type; coreType != "" {
		value := client.AgentHeartbeatRequestCore(coreType)
		req.Core = &value
	}
	if coreVersion, err := a.core.Version(reqCtx); err == nil && coreVersion != "" {
		value := coreVersion
		req.CoreVersion = &value
	}

	resp, err := a.api.Heartbeat(reqCtx, req)
	if err != nil {
		return err
	}
	a.setCoreAlive(a.core.Alive())
	// 面板提示配置版本更新时，提前唤醒配置轮询。
	if resp != nil && resp.ConfigVersion > a.configVersionValue() {
		a.log.Info("面板提示配置有新版本，提前同步", "panel_version", resp.ConfigVersion, "local_version", a.configVersionValue())
		a.wakeConfig()
	}
	return nil
}
