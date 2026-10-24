package agent

import (
	"context"
	"errors"
	"time"

	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/core"
)

// configLoop 配置轮询循环：每 300s 拉取一次配置；304 视为未变更。
func (a *Agent) configLoop(ctx context.Context) {
	interval := a.cfg.Agent.ConfigPollInterval.Duration()
	bo := newBackoff(interval, a.cfg.Agent.MaxBackoff.Duration())

	for {
		err := a.syncConfig(ctx)
		wait := interval
		if err != nil {
			a.log.Warn("拉取配置失败", "error", err.Error())
			wait = bo.next()
		} else {
			bo.reset()
		}

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-a.configWake:
			timer.Stop()
		case <-timer.C:
		}
	}
}

// syncConfig 拉取并应用配置。
//
// 面板返回 304（配置未变更）时直接返回 nil。
func (a *Agent) syncConfig(ctx context.Context) error {
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	resp, err := a.api.FetchConfig(reqCtx, a.configVersionValue())
	if err != nil {
		if errors.Is(err, client.ErrNotModified) {
			a.log.Debug("配置未变更", "version", a.configVersionValue())
			return nil
		}
		return err
	}
	bundle, err := bundleFromConfig(resp)
	if err != nil {
		return err
	}
	if err := a.applyBundle(ctx, bundle); err != nil {
		return err
	}
	a.setConfigVersion(resp.Version)
	a.log.Info("内核配置已更新", "version", resp.Version)
	return nil
}

// applyBundle 应用配置：更新用户映射 → 应用内核 → 落盘缓存。
func (a *Agent) applyBundle(ctx context.Context, bundle *core.Bundle) error {
	if bundle == nil {
		return errors.New("agent: 配置为空")
	}
	// 用户规则变化后，email → uid 映射需要同步更新（流量上报依赖它）。
	a.agg.SetUserMap(bundle.Rules)

	if err := a.core.ApplyConfig(ctx, bundle); err != nil {
		a.log.Error("应用内核配置失败，保留旧配置继续服务", "version", bundle.Version, "error", err.Error())
		a.reportEvent("config_apply_failed", "error", "应用内核配置失败", map[string]any{
			"version": bundle.Version,
			"reason":  err.Error(),
		})
		return err
	}
	a.setCoreAlive(a.core.Alive())

	// 应用成功后再写缓存，保证离线容错用的是「可用」的最后一版配置。
	if a.cache != nil {
		if err := a.cache.Save(bundle); err != nil {
			a.log.Warn("写入本地配置缓存失败", "error", err.Error())
		}
	}
	return nil
}

// applyCachedConfig 应用本地缓存的最后一次配置（面板不可达时的离线容错）。
func (a *Agent) applyCachedConfig(ctx context.Context) error {
	if a.cache == nil {
		return nil
	}
	entry, err := a.cache.Load()
	if err != nil {
		return err
	}
	if entry == nil {
		a.log.Info("本地没有缓存配置，等待面板首次下发")
		return nil
	}
	bundle := entry.Bundle
	a.agg.SetUserMap(bundle.Rules)
	// 启动阶段内核进程还没起来，无法热重载：这里只把配置写盘，
	// 让内核以该配置启动；面板恢复后由正常同步流程再触发重载。
	bundle.Reload = false
	if err := a.core.ApplyConfig(ctx, &bundle); err != nil {
		return err
	}
	a.setCoreAlive(a.core.Alive())
	a.setConfigVersion(entry.Version)
	a.log.Info("已应用本地缓存配置", "version", entry.Version)
	return nil
}

// reportEvent 尽力而为地上报一个事件（失败只记日志）。
func (a *Agent) reportEvent(eventType, level, message string, payload map[string]any) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ev := client.AgentEvent{
		Type:       eventType,
		Level:      client.AgentEventLevel(level),
		Message:    message,
		OccurredAt: time.Now().UTC(),
	}
	if payload != nil {
		ev.Payload = &payload
	}
	if _, err := a.api.ReportEvent(ctx, ev); err != nil {
		a.log.Debug("事件上报失败", "type", eventType, "error", err.Error())
	}
}
