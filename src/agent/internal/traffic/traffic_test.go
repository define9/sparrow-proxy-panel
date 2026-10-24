package traffic

import (
	"path/filepath"
	"testing"

	"github.com/sparrows/sparrow-agent/internal/core"
)

// TestAggregatorDiff 校验只上报增量。
func TestAggregatorDiff(t *testing.T) {
	agg := NewAggregator()
	agg.SetUserMap([]core.UserRule{{Email: "u_1", Uid: 1001}, {Email: "u_2", Uid: 1002}})

	items := agg.Diff(core.Stats{Users: map[string]core.UserStat{
		"u_1": {Upload: 100, Download: 200},
		"u_2": {Upload: 50, Download: 60},
	}})
	if len(items) != 2 {
		t.Fatalf("首次应上报 2 个用户，实际 %d", len(items))
	}
	// 按 uid 升序
	if items[0].Uid != 1001 || items[1].Uid != 1002 {
		t.Fatalf("条目顺序错误: %+v", items)
	}
	if items[0].Upload != 100 || items[0].Download != 200 {
		t.Fatalf("首次增量不对: %+v", items[0])
	}

	// 第二次只有增量
	items = agg.Diff(core.Stats{Users: map[string]core.UserStat{
		"u_1": {Upload: 150, Download: 260},
		"u_2": {Upload: 50, Download: 60},
	}})
	if len(items) != 1 {
		t.Fatalf("第二次应只上报 1 个用户，实际 %d", len(items))
	}
	if items[0].Upload != 50 || items[0].Download != 60 {
		t.Fatalf("增量不对: %+v", items[0])
	}

	// 没有变化则不上报
	items = agg.Diff(core.Stats{Users: map[string]core.UserStat{
		"u_1": {Upload: 150, Download: 260},
		"u_2": {Upload: 50, Download: 60},
	}})
	if len(items) != 0 {
		t.Fatalf("无变化时不应上报，实际 %d 条", len(items))
	}
}

// TestAggregatorIgnoresUnknownUser 校验面板没下发过的标签被忽略。
func TestAggregatorIgnoresUnknownUser(t *testing.T) {
	agg := NewAggregator()
	agg.SetUserMap([]core.UserRule{{Email: "u_1", Uid: 1001}})
	items := agg.Diff(core.Stats{Users: map[string]core.UserStat{
		"u_1":   {Upload: 1, Download: 2},
		"other": {Upload: 3, Download: 4},
	}})
	if len(items) != 1 || items[0].Uid != 1001 {
		t.Fatalf("未知用户应被忽略: %+v", items)
	}
}

// TestAggregatorCounterReset 校验内核计数被重置时的处理。
func TestAggregatorCounterReset(t *testing.T) {
	agg := NewAggregator()
	agg.SetUserMap([]core.UserRule{{Email: "u_1", Uid: 1001}})
	agg.Diff(core.Stats{Users: map[string]core.UserStat{"u_1": {Upload: 1000, Download: 1000}}})
	// 内核重启后计数归零
	items := agg.Diff(core.Stats{Users: map[string]core.UserStat{"u_1": {Upload: 10, Download: 20}}})
	if len(items) != 1 || items[0].Upload != 10 || items[0].Download != 20 {
		t.Fatalf("计数重置后的增量不对: %+v", items)
	}
}

// TestAggregatorRestore 校验重启后可以从持久化状态继续做差。
func TestAggregatorRestore(t *testing.T) {
	agg := NewAggregator()
	agg.SetUserMap([]core.UserRule{{Email: "u_1", Uid: 1001}})
	agg.Diff(core.Stats{Users: map[string]core.UserStat{"u_1": {Upload: 100, Download: 200}}})

	restored := NewAggregator()
	restored.SetUserMap([]core.UserRule{{Email: "u_1", Uid: 1001}})
	restored.Restore(agg.Snapshot())
	items := restored.Diff(core.Stats{Users: map[string]core.UserStat{"u_1": {Upload: 150, Download: 250}}})
	if len(items) != 1 || items[0].Upload != 50 || items[0].Download != 50 {
		t.Fatalf("恢复后的增量不对: %+v", items)
	}
}

// TestOutboxRingBuffer 校验环形缓冲的上限与顺序。
func TestOutboxRingBuffer(t *testing.T) {
	path := filepath.Join(t.TempDir(), "outbox.json")
	box, err := NewOutbox(path, 3)
	if err != nil {
		t.Fatalf("创建队列失败: %v", err)
	}
	for i := 1; i <= 5; i++ {
		if err := box.Append(Record{Seq: int64(i), Items: []Item{{Uid: 1, Upload: 1}}}); err != nil {
			t.Fatalf("追加失败: %v", err)
		}
	}
	if box.Len() != 3 {
		t.Fatalf("队列长度应被限制为 3，实际 %d", box.Len())
	}
	records := box.Records()
	if records[0].Seq != 3 || records[2].Seq != 5 {
		t.Fatalf("队列应保留最新的 3 条: %+v", records)
	}
	// 队首出队
	if err := box.Pop(); err != nil {
		t.Fatalf("出队失败: %v", err)
	}
	head, ok := box.Peek()
	if !ok || head.Seq != 4 {
		t.Fatalf("队首不对: %+v", head)
	}
}

// TestOutboxPersistence 校验队列可以持久化并恢复。
func TestOutboxPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "outbox.json")
	box, err := NewOutbox(path, 100)
	if err != nil {
		t.Fatalf("创建队列失败: %v", err)
	}
	if seq := box.NextSeq(); seq != 1 {
		t.Fatalf("seq 应从 1 开始: %d", seq)
	}
	if err := box.Append(Record{Seq: 1, Items: []Item{{Uid: 7, Upload: 10, Download: 20}}}); err != nil {
		t.Fatalf("追加失败: %v", err)
	}

	restored, err := NewOutbox(path, 100)
	if err != nil {
		t.Fatalf("恢复队列失败: %v", err)
	}
	if restored.Len() != 1 {
		t.Fatalf("恢复后队列长度不对: %d", restored.Len())
	}
	if restored.Seq() != 1 {
		t.Fatalf("恢复后 seq 不对: %d", restored.Seq())
	}
	head, ok := restored.Peek()
	if !ok || head.Items[0].Uid != 7 {
		t.Fatalf("恢复后的记录不对: %+v", head)
	}
}

// TestStatePersistence 校验聚合状态可以持久化。
func TestStatePersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	state := &State{Seq: 5, Last: map[int64]core.UserStat{1001: {Upload: 10, Download: 20}}}
	if err := SaveState(path, state); err != nil {
		t.Fatalf("保存状态失败: %v", err)
	}
	loaded, err := LoadState(path)
	if err != nil {
		t.Fatalf("加载状态失败: %v", err)
	}
	if loaded.Seq != 5 {
		t.Fatalf("seq 不对: %d", loaded.Seq)
	}
	if loaded.Last[1001].Upload != 10 || loaded.Last[1001].Download != 20 {
		t.Fatalf("状态不对: %+v", loaded.Last)
	}
}

// TestLoadStateMissing 校验状态文件不存在时返回空状态。
func TestLoadStateMissing(t *testing.T) {
	loaded, err := LoadState(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if loaded.Seq != 0 || len(loaded.Last) != 0 {
		t.Fatalf("应返回空状态: %+v", loaded)
	}
}
