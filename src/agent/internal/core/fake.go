package core

import (
	"context"
	"sync"
)

// Fake 是用于单元测试的假内核：不启动任何真实进程，只记录收到的配置。
type Fake struct {
	mu       sync.Mutex
	bundles  []*Bundle
	restarts int
	versions int
	stats    Stats
	alive    bool
	applyErr error
	statsErr error
	version  string
}

// NewFake 构造假内核。
func NewFake(_ Options) *Fake {
	return &Fake{
		alive:   true,
		version: "fake-0.0.0",
	}
}

// ApplyConfig 记录配置。
func (f *Fake) ApplyConfig(_ context.Context, bundle *Bundle) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.applyErr != nil {
		return f.applyErr
	}
	clone := *bundle
	f.bundles = append(f.bundles, &clone)
	return nil
}

// Restart 记录一次重启。
func (f *Fake) Restart(_ context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.restarts++
	return nil
}

// Version 返回固定版本号。
func (f *Fake) Version(_ context.Context) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.versions++
	if f.version == "" {
		return "fake-0.0.0", nil
	}
	return f.version, nil
}

// Stats 返回预置的流量统计。
func (f *Fake) Stats(_ context.Context) (Stats, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.statsErr != nil {
		return Stats{}, f.statsErr
	}
	out := Stats{
		TotalUpload:   f.stats.TotalUpload,
		TotalDownload: f.stats.TotalDownload,
		OnlineUsers:   f.stats.OnlineUsers,
		Users:         make(map[string]UserStat, len(f.stats.Users)),
	}
	for k, v := range f.stats.Users {
		out.Users[k] = v
	}
	return out, nil
}

// Alive 返回内核是否存活。
func (f *Fake) Alive() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.alive
}

// Close 标记内核停止。
func (f *Fake) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.alive = false
	return nil
}

// Bundles 返回已经应用过的配置列表（测试断言用）。
func (f *Fake) Bundles() []*Bundle {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]*Bundle, len(f.bundles))
	copy(out, f.bundles)
	return out
}

// Restarts 返回重启次数（测试断言用）。
func (f *Fake) Restarts() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.restarts
}

// SetStats 设置下次采集到的流量统计。
func (f *Fake) SetStats(stats Stats) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stats = stats
}

// SetApplyError 让后续 ApplyConfig 返回指定错误。
func (f *Fake) SetApplyError(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.applyErr = err
}

// SetAlive 设置内核存活状态。
func (f *Fake) SetAlive(alive bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.alive = alive
}
