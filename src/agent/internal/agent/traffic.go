package agent

import (
	"context"
	"time"

	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/traffic"
)

// trafficLoop 流量上报循环：每 30s 采集增量并上报。
//
// 上报失败时记录会留在本地环形缓冲里，下次循环（或恢复后）自动补报。
func (a *Agent) trafficLoop(ctx context.Context) {
	interval := a.cfg.Agent.TrafficReportPeriod.Duration()
	bo := newBackoff(interval, a.cfg.Agent.MaxBackoff.Duration())

	for {
		err := a.collectAndReport(ctx)
		wait := interval
		if err != nil {
			a.log.Warn("流量上报失败", "error", err.Error())
			wait = bo.next()
		} else {
			bo.reset()
		}
		if !sleep(ctx, wait) {
			return
		}
	}
}

// collectAndReport 采集一次增量并尝试上报。
func (a *Agent) collectAndReport(ctx context.Context) error {
	stats, err := a.core.Stats(ctx)
	if err != nil {
		return err
	}
	items := a.agg.Diff(stats)
	if len(items) > 0 {
		record := traffic.Record{Seq: a.outbox.NextSeq(), Items: items}
		if err := a.outbox.Append(record); err != nil {
			return err
		}
		a.persistTrafficState()
	}
	// 队列是 FIFO：先发旧记录再发新记录，seq 单调递增，面板按 seq 幂等去重。
	return a.flushOutbox(ctx)
}

// flushOutbox 把本地队列里的记录按 seq 顺序发给面板。
func (a *Agent) flushOutbox(ctx context.Context) error {
	for {
		record, ok := a.outbox.Peek()
		if !ok {
			a.metrics.Set("sparrow_agent_traffic_outbox_size", nil, float64(a.outbox.Len()))
			return nil
		}
		reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		items := make([]client.TrafficItem, 0, len(record.Items))
		var upload, download uint64
		for _, item := range record.Items {
			items = append(items, client.TrafficItem{
				Uid:      item.Uid,
				Upload:   int64(item.Upload),
				Download: int64(item.Download),
			})
			upload += item.Upload
			download += item.Download
		}
		_, err := a.api.ReportTraffic(reqCtx, client.NewTrafficReport(record.Seq, items))
		cancel()
		if err != nil {
			a.metrics.Inc("sparrow_agent_traffic_report_total", map[string]string{"result": "failure"})
			a.metrics.Set("sparrow_agent_traffic_outbox_size", nil, float64(a.outbox.Len()))
			return err
		}
		if err := a.outbox.Pop(); err != nil {
			return err
		}
		a.metrics.Inc("sparrow_agent_traffic_report_total", map[string]string{"result": "success"})
		a.metrics.Add("sparrow_agent_traffic_bytes_total", map[string]string{"direction": "upload"}, float64(upload))
		a.metrics.Add("sparrow_agent_traffic_bytes_total", map[string]string{"direction": "download"}, float64(download))
		a.metrics.Set("sparrow_agent_traffic_outbox_size", nil, float64(a.outbox.Len()))
	}
}

// flushTraffic 退出前把队列里的记录尽力发完。
func (a *Agent) flushTraffic(ctx context.Context) error {
	if err := a.flushOutbox(ctx); err != nil {
		return err
	}
	a.persistTrafficState()
	return nil
}

// persistTrafficState 把聚合状态（累计值与 seq）落盘，重启后继续做差。
func (a *Agent) persistTrafficState() {
	state := &traffic.State{
		Seq:  a.outbox.Seq(),
		Last: a.agg.Snapshot(),
	}
	if err := traffic.SaveState(a.cfg.TrafficStateFile(), state); err != nil {
		a.log.Warn("保存流量状态失败", "error", err.Error())
	}
}
