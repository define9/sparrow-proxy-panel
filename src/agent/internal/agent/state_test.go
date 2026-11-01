package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"sparrow/agent/internal/model"
	"sparrow/agent/internal/traffic"
)

func TestStoreDefaultsWhenMissing(t *testing.T) {
	dir := t.TempDir()
	st, err := NewStore(dir, nil).Load()
	if err != nil {
		t.Fatalf("文件不存在不应报错: %v", err)
	}
	if st.Seq != 0 {
		t.Fatalf("seq 默认应为 0，实际 %d", st.Seq)
	}
	// 首次必须发 -1，否则面板版本 0 会直接命中 304。
	if st.ConfigVersion != DefaultConfigVersion {
		t.Fatalf("configVersion 默认应为 -1，实际 %d", st.ConfigVersion)
	}
	if st.Backlog == nil || len(st.Backlog) != 0 {
		t.Fatalf("backlog 默认应为空切片，实际 %+v", st.Backlog)
	}
}

func TestStoreRoundTripAtomicFile(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, nil)

	want := State{
		Seq:           12,
		ConfigVersion: 3,
		CoreVersion:   "1.12.0",
		Backlog:       []model.TrafficItem{{UID: 1001, Upload: 123, Download: 456}},
	}
	if err := store.Save(want); err != nil {
		t.Fatalf("保存失败: %v", err)
	}

	// 落盘文件权限必须是 0600，且不留 .tmp。
	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("state.json 权限期望 0600，实际 %o", perm)
	}
	if _, err := os.Stat(store.Path() + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("不应残留 .tmp 文件，err=%v", err)
	}

	raw, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatal(err)
	}
	var onDisk State
	if err := json.Unmarshal(raw, &onDisk); err != nil {
		t.Fatalf("state.json 不是合法 JSON: %v\n%s", err, raw)
	}
	if onDisk.Seq != 12 || onDisk.ConfigVersion != 3 || onDisk.CoreVersion != "1.12.0" {
		t.Fatalf("落盘内容不符: %+v", onDisk)
	}
	if len(onDisk.Backlog) != 1 || onDisk.Backlog[0].UID != 1001 || onDisk.Backlog[0].Upload != 123 {
		t.Fatalf("backlog 落盘不符: %+v", onDisk.Backlog)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Seq != want.Seq || loaded.ConfigVersion != want.ConfigVersion ||
		loaded.CoreVersion != want.CoreVersion || len(loaded.Backlog) != 1 {
		t.Fatalf("Load 结果不符: %+v", loaded)
	}

	// 覆盖写仍然是完整文件（不是追加）。
	if err := store.Save(State{Seq: 13, ConfigVersion: 4}); err != nil {
		t.Fatal(err)
	}
	loaded, err = store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Seq != 13 || len(loaded.Backlog) != 0 {
		t.Fatalf("覆盖写结果不符: %+v", loaded)
	}
}

func TestStoreCorruptFileFallsBack(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, nil)
	if err := os.WriteFile(store.Path(), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	st, err := store.Load()
	if err == nil {
		t.Fatal("损坏的 state.json 应返回错误，让上层告警")
	}
	if st.ConfigVersion != DefaultConfigVersion || st.Seq != 0 {
		t.Fatalf("损坏时应回退默认值，实际 %+v", st)
	}
}

func TestStoreTrimsBacklogToLimit(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, testLogger())

	items := make([]model.TrafficItem, traffic.MaxBacklog+3)
	for i := range items {
		items[i] = model.TrafficItem{UID: i + 1000}
	}
	if err := store.Save(State{Seq: 1, ConfigVersion: 0, Backlog: items}); err != nil {
		t.Fatal(err)
	}

	st, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Backlog) != traffic.MaxBacklog {
		t.Fatalf("backlog 应截断到 %d，实际 %d", traffic.MaxBacklog, len(st.Backlog))
	}
	// 丢弃最旧的 3 条，保留尾部。
	if st.Backlog[0].UID != items[3].UID {
		t.Fatalf("应丢弃最旧条目，首个保留 uid 期望 %d，实际 %d", items[3].UID, st.Backlog[0].UID)
	}
	last := len(items) - 1
	if st.Backlog[len(st.Backlog)-1].UID != items[last].UID {
		t.Fatalf("最后一条应保留，期望 %d，实际 %d", items[last].UID, st.Backlog[len(st.Backlog)-1].UID)
	}
}

func TestStorePathUnderDataDir(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, nil)
	if want := filepath.Join(dir, "state.json"); store.Path() != want {
		t.Fatalf("状态文件路径期望 %s，实际 %s", want, store.Path())
	}
}
