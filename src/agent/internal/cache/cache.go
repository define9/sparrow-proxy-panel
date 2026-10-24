// Package cache 保存面板下发的最后一份配置，用于面板不可达时的离线容错。
package cache

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/sparrows/sparrow-agent/internal/core"
)

// Entry 是缓存的配置。
type Entry struct {
	// Version 配置版本号
	Version int64 `json:"version"`
	// ReceivedAt 收到配置的时间
	ReceivedAt time.Time `json:"receivedAt"`
	// Bundle 配置内容
	Bundle core.Bundle `json:"bundle"`
}

// Cache 是配置缓存（单文件 JSON）。
type Cache struct {
	path string
}

// New 创建配置缓存。
func New(path string) *Cache {
	return &Cache{path: path}
}

// Path 返回缓存文件路径。
func (c *Cache) Path() string { return c.path }

// Save 写入缓存（原子替换）。
func (c *Cache) Save(bundle *core.Bundle) error {
	if bundle == nil {
		return errors.New("cache: 配置为空")
	}
	entry := Entry{Version: bundle.Version, ReceivedAt: time.Now().UTC(), Bundle: *bundle}
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(c.path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}

// Load 读取缓存；文件不存在时返回 (nil, nil)。
func (c *Cache) Load() (*Entry, error) {
	raw, err := os.ReadFile(c.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	entry := &Entry{}
	if err := json.Unmarshal(raw, entry); err != nil {
		return nil, err
	}
	return entry, nil
}

// Clear 删除缓存文件。
func (c *Cache) Clear() error {
	err := os.Remove(c.path)
	if err != nil && os.IsNotExist(err) {
		return nil
	}
	return err
}
