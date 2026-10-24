// Package traffic 负责流量采集后的本地聚合：
//   - 只上报增量（维护上次上报值）
//   - 上报失败时进入本地环形缓冲（最多 5000 条），恢复后补报
package traffic

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/sparrows/sparrow-agent/internal/core"
)

// Item 是单个用户的流量增量，单位为**字节**。
type Item struct {
	// Uid 面板侧的用户数字 ID
	Uid int64 `json:"uid"`
	// Upload 上行字节数
	Upload uint64 `json:"upload"`
	// Download 下行字节数
	Download uint64 `json:"download"`
}

// Record 是一次上报记录（seq 单调递增，面板据此幂等去重）。
type Record struct {
	// Seq 单调递增序号
	Seq int64 `json:"seq"`
	// Items 本次上报的用户流量增量
	Items []Item `json:"items"`
}

// Aggregator 维护内核绝对计数到面板增量的换算。
//
// 内核按 email 标签统计，面板按 uid 统计，两者通过下发配置里的用户规则映射。
type Aggregator struct {
	mu    sync.Mutex
	uidOf map[string]int64 // email -> uid
	last  map[int64]core.UserStat
}

// NewAggregator 创建聚合器。
func NewAggregator() *Aggregator {
	return &Aggregator{
		uidOf: map[string]int64{},
		last:  map[int64]core.UserStat{},
	}
}

// SetUserMap 更新 email → uid 映射（配置变更时调用）。
func (a *Aggregator) SetUserMap(rules []core.UserRule) {
	m := make(map[string]int64, len(rules))
	for _, r := range rules {
		if r.Email == "" {
			continue
		}
		m[r.Email] = r.Uid
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.uidOf = m
}

// Diff 把内核的绝对计数换算成本次需要上报的增量。
//
// 返回值按 uid 升序排列，便于测试与幂等重放。
func (a *Aggregator) Diff(stats core.Stats) []Item {
	a.mu.Lock()
	defer a.mu.Unlock()

	items := make([]Item, 0, len(stats.Users))
	for email, cur := range stats.Users {
		uid, ok := a.uidOf[email]
		if !ok {
			// 面板没下发过这个标签，忽略（避免脏数据）
			continue
		}
		prev := a.last[uid]
		upload := cur.Upload
		download := cur.Download
		if cur.Upload < prev.Upload {
			// 内核计数被重置（重启），把当前值整体当作增量
			upload = cur.Upload
		} else {
			upload = cur.Upload - prev.Upload
		}
		if cur.Download < prev.Download {
			download = cur.Download
		} else {
			download = cur.Download - prev.Download
		}
		a.last[uid] = core.UserStat{Upload: cur.Upload, Download: cur.Download}
		if upload == 0 && download == 0 {
			continue
		}
		items = append(items, Item{Uid: uid, Upload: upload, Download: download})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Uid < items[j].Uid })
	return items
}

// Snapshot 返回当前记录的绝对计数（持久化用）。
func (a *Aggregator) Snapshot() map[int64]core.UserStat {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make(map[int64]core.UserStat, len(a.last))
	for k, v := range a.last {
		out[k] = v
	}
	return out
}

// Restore 恢复绝对计数（重启后继续做差）。
func (a *Aggregator) Restore(state map[int64]core.UserStat) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.last = make(map[int64]core.UserStat, len(state))
	for k, v := range state {
		a.last[k] = v
	}
}

// State 是需要持久化的聚合状态。
type State struct {
	// Seq 下一个可用的序号
	Seq int64 `json:"seq"`
	// Last 每个 uid 的上次绝对计数
	Last map[int64]core.UserStat `json:"last"`
}

// LoadState 从磁盘读取聚合状态；文件不存在时返回零值状态。
func LoadState(path string) (*State, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &State{Last: map[int64]core.UserStat{}}, nil
		}
		return nil, err
	}
	state := &State{Last: map[int64]core.UserStat{}}
	if err := json.Unmarshal(raw, state); err != nil {
		return nil, err
	}
	if state.Last == nil {
		state.Last = map[int64]core.UserStat{}
	}
	return state, nil
}

// SaveState 把聚合状态写入磁盘（原子替换）。
func SaveState(path string, state *State) error {
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Outbox 是本地上报队列（环形缓冲）。
//
// 上报失败时把记录追加到队列；恢复后按 seq 顺序补报。
// 队列上限为 max 条，超出后丢弃最旧的记录（面板侧以 seq 幂等，丢最旧的可接受）。
type Outbox struct {
	mu      sync.Mutex
	path    string
	max     int
	records []Record
	seq     int64
}

// ErrEmpty 表示队列为空。
var ErrEmpty = errors.New("traffic: 上报队列为空")

// NewOutbox 创建（并从磁盘恢复）上报队列。
func NewOutbox(path string, max int) (*Outbox, error) {
	if max <= 0 {
		max = 5000
	}
	o := &Outbox{path: path, max: max}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return o, nil
		}
		return nil, err
	}
	var state struct {
		Seq     int64    `json:"seq"`
		Records []Record `json:"records"`
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, err
	}
	o.records = state.Records
	o.seq = state.Seq
	if len(o.records) > o.max {
		o.records = o.records[len(o.records)-o.max:]
	}
	return o, nil
}

// NextSeq 返回下一个序号（单调递增）。
func (o *Outbox) NextSeq() int64 {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.seq++
	return o.seq
}

// Seq 返回当前已分配的最大序号。
func (o *Outbox) Seq() int64 {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.seq
}

// Append 把一条记录追加到队列并落盘。
func (o *Outbox) Append(rec Record) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.records = append(o.records, rec)
	if len(o.records) > o.max {
		o.records = o.records[len(o.records)-o.max:]
	}
	return o.persistLocked()
}

// Peek 返回队首记录（不删除）。
func (o *Outbox) Peek() (Record, bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.records) == 0 {
		return Record{}, false
	}
	return o.records[0], true
}

// Pop 删除队首记录并落盘。
func (o *Outbox) Pop() error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.records) == 0 {
		return ErrEmpty
	}
	o.records = o.records[1:]
	return o.persistLocked()
}

// Len 返回队列长度。
func (o *Outbox) Len() int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return len(o.records)
}

// Records 返回队列快照（测试断言用）。
func (o *Outbox) Records() []Record {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make([]Record, len(o.records))
	copy(out, o.records)
	return out
}

// persistLocked 落盘（调用方需持有锁）。
func (o *Outbox) persistLocked() error {
	if o.path == "" {
		return nil
	}
	state := struct {
		Seq     int64    `json:"seq"`
		Records []Record `json:"records"`
	}{Seq: o.seq, Records: o.records}
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(o.path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := o.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, o.path)
}
