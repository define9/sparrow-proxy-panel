package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"sparrow/agent/internal/model"
	"sparrow/agent/internal/traffic"
)

const (
	// stateFileName 是 data_dir 下的持久化状态文件名。
	stateFileName = "state.json"

	// DefaultConfigVersion 是首次运行的配置版本哨兵。
	// 面板的 configVersion 从 0 开始，首次必须发 -1，否则会直接命中 304 分支。
	DefaultConfigVersion int64 = -1
)

// State 是重启后必须保留的 Agent 状态，落盘为 data_dir/state.json：
//
//	{ "seq": 12, "configVersion": 3, "coreVersion": "1.12.0", "backlog": [...] }
type State struct {
	Seq           int64               `json:"seq"`
	ConfigVersion int64               `json:"configVersion"`
	CoreVersion   string              `json:"coreVersion"`
	Backlog       []model.TrafficItem `json:"backlog"`
}

func defaultState() State {
	return State{Seq: 0, ConfigVersion: DefaultConfigVersion, Backlog: []model.TrafficItem{}}
}

// Store 负责 state.json 的读取与原子写入。
type Store struct {
	path string
	log  *slog.Logger
	mu   sync.Mutex
}

// NewStore 指向 <dataDir>/state.json。log 可为 nil（CLI 只读场景）。
func NewStore(dataDir string, log *slog.Logger) *Store {
	return &Store{path: filepath.Join(dataDir, stateFileName), log: log}
}

func (s *Store) Path() string { return s.path }

// Load 读取状态；文件不存在时返回 seq=0、configVersion=-1 的默认值。
// 文件损坏时同时返回默认值与错误，由调用方决定是否继续（Agent 会告警后继续）。
func (s *Store) Load() (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultState(), nil
		}
		return defaultState(), fmt.Errorf("读取 %s 失败: %w", s.path, err)
	}

	state := defaultState()
	if err := json.Unmarshal(raw, &state); err != nil {
		return defaultState(), fmt.Errorf("解析 %s 失败: %w", s.path, err)
	}
	if state.Backlog == nil {
		state.Backlog = []model.TrafficItem{}
	}
	return state, nil
}

// Save 原子写入状态：先写 state.json.tmp（0600），fsync 后 rename 覆盖。
// backlog 超过 traffic.MaxBacklog 时丢弃最旧的条目并记录 warn。
func (s *Store) Save(state State) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	kept, dropped := traffic.TrimBacklog(state.Backlog, traffic.MaxBacklog)
	if dropped > 0 && s.log != nil {
		s.log.Warn("backlog 超过上限，丢弃最旧条目",
			"dropped", dropped, "limit", traffic.MaxBacklog, "kept", len(kept))
	}
	if kept == nil {
		kept = []model.TrafficItem{}
	}
	state.Backlog = kept

	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化状态失败: %w", err)
	}
	raw = append(raw, '\n')

	if err := writeFileAtomic(s.path, raw, 0o600); err != nil {
		return err
	}
	return nil
}

// writeFileAtomic 写临时文件 → fsync → rename，避免进程被杀时留下半个 state.json。
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("创建目录 %s 失败: %w", dir, err)
	}

	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return fmt.Errorf("打开临时文件失败: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("同步临时文件失败: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("关闭临时文件失败: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("重命名状态文件失败: %w", err)
	}

	// 目录 fsync 保证 rename 落盘（部分文件系统需要）。
	if d, dirErr := os.Open(dir); dirErr == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}
