// Package cache 提供 Agent 的离线缓存：面板不可达且本地有缓存时，用磁盘上的
// 最后一份配置/证书继续服务。
//
// 目录结构（Dir 为 cfg.Agent.DataDir/cache/）：
//
//	Dir/config.json      {"version":3,"core":"sing-box","savedAt":"...","config":{...}}
//	Dir/certs/{name}.pem 证书（0600）
//	Dir/certs/{name}.key 私钥（0600）
//
// 所有写入都是「同目录临时文件 + fsync + rename」的原子写，不会留下半截文件。
package cache

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"sparrow/agent/internal/model"
)

const (
	// ConfigFile 是离线配置的固定文件名。
	ConfigFile = "config.json"
	certsDir   = "certs"

	dirPerm  = 0o700
	filePerm = 0o600
)

// Cache 是某个缓存目录的句柄。
type Cache struct{ Dir string }

// New 构造缓存句柄（Dir 一般是 filepath.Join(cfg.Agent.DataDir, "cache")）。
func New(dir string) *Cache { return &Cache{Dir: dir} }

// 离线配置是「下发给内核的配置 + 版本/内核类型」的信封，一次原子写完成。
type configEnvelope struct {
	Version int             `json:"version"`
	Core    string          `json:"core"`
	SavedAt time.Time       `json:"savedAt"`
	Config  json.RawMessage `json:"config"`
}

// SaveConfig 原子写入一份配置。
func (c *Cache) SaveConfig(version int, core string, config []byte) error {
	if err := c.ready(); err != nil {
		return err
	}
	if len(config) == 0 {
		return errors.New("cache: 配置为空，拒绝写入")
	}
	if !json.Valid(config) {
		return errors.New("cache: 配置不是合法 JSON，拒绝写入")
	}

	payload, err := json.Marshal(configEnvelope{
		Version: version,
		Core:    core,
		SavedAt: time.Now().UTC(),
		Config:  json.RawMessage(config),
	})
	if err != nil {
		return fmt.Errorf("cache: 序列化配置失败: %w", err)
	}

	if err := writeAtomic(filepath.Join(c.Dir, ConfigFile), payload); err != nil {
		return fmt.Errorf("cache: 写入离线配置失败: %w", err)
	}
	return nil
}

// LoadConfig 读回离线配置；没有缓存时返回的错误可用 errors.Is(err, os.ErrNotExist) 判断。
func (c *Cache) LoadConfig() (version int, core string, config []byte, err error) {
	if err := c.ready(); err != nil {
		return 0, "", nil, err
	}

	path := filepath.Join(c.Dir, ConfigFile)
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, "", nil, fmt.Errorf("cache: 读取离线配置失败: %w", err)
	}

	var envelope configEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return 0, "", nil, fmt.Errorf("cache: 离线配置 %s 损坏: %w", path, err)
	}
	if len(envelope.Config) == 0 {
		return 0, "", nil, fmt.Errorf("cache: 离线配置 %s 缺少 config 字段", path)
	}
	return envelope.Version, envelope.Core, []byte(envelope.Config), nil
}

// SaveCertificates 把证书写到 Dir/certs/{name}.pem / {name}.key（0600）。
func (c *Cache) SaveCertificates(certs []model.Certificate) error {
	if err := c.ready(); err != nil {
		return err
	}
	if len(certs) == 0 {
		return nil
	}

	dir := filepath.Join(c.Dir, certsDir)
	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return fmt.Errorf("cache: 创建证书目录失败: %w", err)
	}

	for _, cert := range certs {
		name := strings.TrimSpace(cert.Name)
		if err := validCertName(name); err != nil {
			return err
		}
		if cert.Cert != "" {
			if err := writeAtomic(filepath.Join(dir, name+".pem"), ensureNewline(cert.Cert)); err != nil {
				return fmt.Errorf("cache: 写入证书 %q 失败: %w", name, err)
			}
		}
		if cert.Key != "" {
			if err := writeAtomic(filepath.Join(dir, name+".key"), ensureNewline(cert.Key)); err != nil {
				return fmt.Errorf("cache: 写入私钥 %q 失败: %w", name, err)
			}
		}
	}
	return nil
}

func (c *Cache) ready() error {
	if c == nil || strings.TrimSpace(c.Dir) == "" {
		return errors.New("cache: 未配置缓存目录")
	}
	return nil
}

// validCertName 防止证书名把文件写到缓存目录之外。
func validCertName(name string) error {
	if name == "" {
		return errors.New("cache: 证书缺少 name")
	}
	if name == "." || name == ".." || name != filepath.Base(name) ||
		strings.ContainsAny(name, `/\`) || strings.ContainsRune(name, 0) {
		return fmt.Errorf("cache: 非法证书名 %q", name)
	}
	return nil
}

// writeAtomic 同目录写临时文件 → fsync → rename，权限固定 0600。
func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	keep := false
	defer func() {
		if !keep {
			_ = tmp.Close()
			_ = os.Remove(tmpName)
		}
	}()

	if err := tmp.Chmod(filePerm); err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}

	keep = true
	return nil
}

// ensureNewline 保证 PEM 以换行结尾（内核解析器对此比较挑剔）。
func ensureNewline(text string) []byte {
	if text == "" {
		return nil
	}
	if strings.HasSuffix(text, "\n") {
		return []byte(text)
	}
	return []byte(text + "\n")
}
