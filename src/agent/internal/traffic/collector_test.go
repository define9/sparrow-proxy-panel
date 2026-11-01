package traffic

import (
	"context"
	"errors"
	"sync"
	"testing"

	"sparrow/agent/internal/model"
)

// stubCore 只实现 Collect 用到的 Stats，其余方法留空即可。
type stubCore struct {
	mu    sync.Mutex
	stats []model.UserStat
	err   error
}

func (s *stubCore) Name() string { return "stub" }
func (s *stubCore) Version(context.Context) (string, error) {
	return "0.0.0", nil
}
func (s *stubCore) Apply(context.Context, []byte) error { return nil }
func (s *stubCore) Restart(context.Context) error       { return nil }
func (s *stubCore) Stats(context.Context) ([]model.UserStat, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]model.UserStat(nil), s.stats...), s.err
}
func (s *stubCore) OnlineUsers(context.Context) (int, error) { return 0, nil }
func (s *stubCore) Alive(context.Context) bool               { return true }
func (s *stubCore) Stop(context.Context) error               { return nil }

func (s *stubCore) set(stats []model.UserStat) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stats = stats
}

func TestCollectIncrements(t *testing.T) {
	core := &stubCore{}
	c := NewCollector()
	ctx := context.Background()

	// 首次采集：全部是增量（上次基线为 0）。
	core.set([]model.UserStat{{UID: 1001, Upload: 100, Download: 200}})
	items, err := c.Collect(ctx, core)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].UID != 1001 || items[0].Upload != 100 || items[0].Download != 200 {
		t.Fatalf("首次采集期望全量增量，实际 %+v", items)
	}

	// 第二次：只上报差值。
	core.set([]model.UserStat{{UID: 1001, Upload: 150, Download: 900}})
	items, err = c.Collect(ctx, core)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Upload != 50 || items[0].Download != 700 {
		t.Fatalf("第二次期望增量 50/700，实际 %+v", items)
	}

	// 没有变化：返回空切片（不产生上报）。
	items, err = c.Collect(ctx, core)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("无变化应返回空，实际 %+v", items)
	}
}

func TestCollectCounterReset(t *testing.T) {
	core := &stubCore{}
	c := NewCollector()
	ctx := context.Background()

	core.set([]model.UserStat{{UID: 1001, Upload: 1000, Download: 2000}})
	if _, err := c.Collect(ctx, core); err != nil {
		t.Fatal(err)
	}

	// 内核重启 → 计数器归零后重新累计：差值出现负数时按当前值上报。
	core.set([]model.UserStat{{UID: 1001, Upload: 30, Download: 40}})
	items, err := c.Collect(ctx, core)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Upload != 30 || items[0].Download != 40 {
		t.Fatalf("计数器归零后期望按当前值上报，实际 %+v", items)
	}

	// Reset 后基线清空：下一次按全量上报。
	c.Reset()
	core.set([]model.UserStat{{UID: 2002, Upload: 7, Download: 9}})
	items, err = c.Collect(ctx, core)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].UID != 2002 || items[0].Upload != 7 || items[0].Download != 9 {
		t.Fatalf("Reset 后期望全量上报，实际 %+v", items)
	}
}

func TestCollectPropagatesStatsError(t *testing.T) {
	core := &stubCore{err: errors.New("clash api 不可用")}
	c := NewCollector()
	if _, err := c.Collect(context.Background(), core); err == nil {
		t.Fatal("Stats 报错时应透传错误")
	}
}

func TestMergeSameUID(t *testing.T) {
	backlog := []model.TrafficItem{
		{UID: 1001, Upload: 10, Download: 20},
		{UID: 1002, Upload: 1, Download: 2},
	}
	fresh := []model.TrafficItem{
		{UID: 1001, Upload: 5, Download: 7},
		{UID: 1003, Upload: 100, Download: 200},
	}

	merged := Merge(backlog, fresh)
	if len(merged) != 3 {
		t.Fatalf("期望 3 个 uid，实际 %+v", merged)
	}

	got := map[int]model.TrafficItem{}
	for _, item := range merged {
		got[item.UID] = item
	}
	if got[1001].Upload != 15 || got[1001].Download != 27 {
		t.Fatalf("同 uid 应相加，1001 实际 %+v", got[1001])
	}
	if got[1002].Upload != 1 || got[1002].Download != 2 {
		t.Fatalf("1002 应保持原值，实际 %+v", got[1002])
	}
	if got[1003].Upload != 100 || got[1003].Download != 200 {
		t.Fatalf("1003 应为新增，实际 %+v", got[1003])
	}

	// 保持首次出现的顺序（面板日志可读性）。
	wantOrder := []int{1001, 1002, 1003}
	for i, uid := range wantOrder {
		if merged[i].UID != uid {
			t.Fatalf("顺序期望 %v，实际 %+v", wantOrder, merged)
		}
	}
}

func TestMergeEmpty(t *testing.T) {
	if got := Merge(nil, []model.TrafficItem{}); len(got) != 0 {
		t.Fatalf("空输入应返回空，实际 %+v", got)
	}
}

func TestTrimBacklogDropsOldest(t *testing.T) {
	items := []model.TrafficItem{
		{UID: 1}, {UID: 2}, {UID: 3}, {UID: 4}, {UID: 5},
	}
	kept, dropped := TrimBacklog(items, 3)
	if dropped != 2 {
		t.Fatalf("期望丢弃 2 条，实际 %d", dropped)
	}
	if len(kept) != 3 || kept[0].UID != 3 || kept[2].UID != 5 {
		t.Fatalf("期望保留最旧的尾部 3/4/5，实际 %+v", kept)
	}

	// 未超限时不改动、不丢弃。
	if kept, dropped := TrimBacklog(items, 10); dropped != 0 || len(kept) != 5 {
		t.Fatalf("未超限不应改动，dropped=%d len=%d", dropped, len(kept))
	}
	// limit <= 0 视为不限制（避免误配置清空 backlog）。
	if kept, dropped := TrimBacklog(items, 0); dropped != 0 || len(kept) != 5 {
		t.Fatalf("limit=0 不应丢弃，dropped=%d len=%d", dropped, len(kept))
	}
}
