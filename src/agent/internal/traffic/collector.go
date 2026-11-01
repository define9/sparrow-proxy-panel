// Package traffic 负责把内核的累计流量转成增量、缓冲失败的重报、并维护单调 seq。
package traffic

import (
	"context"
	"sync"

	"sparrow/agent/internal/core"
	"sparrow/agent/internal/model"
)

// Collector 计算「本次累计值 - 上次累计值」。
// 内核统计是累计的，重启后可能归零，因此差值出现负数时按归零处理（取当前值）。
type Collector struct {
	mu   sync.Mutex
	last map[int]model.UserStat
}

func NewCollector() *Collector {
	return &Collector{last: map[int]model.UserStat{}}
}

// Collect 返回自上次调用以来的增量；没有变化返回空切片。
func (c *Collector) Collect(ctx context.Context, core core.Core) ([]model.TrafficItem, error) {
	stats, err := core.Stats(ctx)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	items := make([]model.TrafficItem, 0, len(stats))
	for _, stat := range stats {
		prev := c.last[stat.UID]

		up := stat.Upload - prev.Upload
		down := stat.Download - prev.Download
		if up < 0 {
			up = stat.Upload // 计数器归零（内核重启）
		}
		if down < 0 {
			down = stat.Download
		}

		c.last[stat.UID] = stat
		if up > 0 || down > 0 {
			items = append(items, model.TrafficItem{UID: stat.UID, Upload: up, Download: down})
		}
	}
	return items, nil
}

// Reset 在内核重启后清空基线。
func (c *Collector) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.last = map[int]model.UserStat{}
}

// Merge 合并两批增量（同 uid 相加），用于把失败重报的缓存拼回本次上报。
func Merge(batches ...[]model.TrafficItem) []model.TrafficItem {
	agg := map[int]model.TrafficItem{}
	order := []int{}
	for _, batch := range batches {
		for _, item := range batch {
			cur, ok := agg[item.UID]
			if !ok {
				order = append(order, item.UID)
			}
			cur.UID = item.UID
			cur.Upload += item.Upload
			cur.Download += item.Download
			agg[item.UID] = cur
		}
	}
	out := make([]model.TrafficItem, 0, len(order))
	for _, uid := range order {
		out = append(out, agg[uid])
	}
	return out
}
