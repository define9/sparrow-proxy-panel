package agent

import (
	"os/exec"
	"path/filepath"
	"strings"

	"sparrow/agent/internal/config"
	"sparrow/agent/internal/model"
)

// pgrepFn 探测某个命令行模式是否匹配到进程，测试可替换。
// 生产实现用 `pgrep -f <basename>`，不依赖内核自己带的进程句柄。
var pgrepFn = func(pattern string) bool {
	out, err := exec.Command("pgrep", "-f", pattern).Output()
	return err == nil && len(strings.TrimSpace(string(out))) > 0
}

// DetectCoreAlive 判断内核进程是否在运行（不需要连面板或持有 Runner）。
func DetectCoreAlive(binary string) bool {
	binary = strings.TrimSpace(binary)
	if binary == "" {
		return false
	}
	return pgrepFn(filepath.Base(binary))
}

// LocalStatus 供 `sparrow-agent status` 使用：只读本地 state.json 并探测内核进程，
// 不发任何网络请求，因此面板不可达时也能用。
func LocalStatus(cfg *config.Config) map[string]any {
	store := NewStore(cfg.Agent.DataDir, nil)
	state, err := store.Load()

	out := map[string]any{
		"registered":    cfg.Registered(),
		"panel":         cfg.Panel.URL,
		"nodeId":        cfg.Panel.NodeID,
		"core":          cfg.Core.Type,
		"coreBinary":    cfg.Core.Binary,
		"coreAlive":     DetectCoreAlive(cfg.Core.Binary),
		"agent":         model.Version,
		"stateFile":     store.Path(),
		"configVersion": state.ConfigVersion,
		"trafficSeq":    state.Seq,
		"coreVersion":   state.CoreVersion,
		"backlog":       len(state.Backlog),
	}
	if err != nil {
		out["stateError"] = err.Error()
	}
	return out
}
