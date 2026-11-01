package core

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"sparrow/agent/internal/model"
)

// processCore 是 sing-box / xray 共用的进程管理骨架。
// 差异点通过嵌入结构体覆盖（见 singbox.go / xray.go）。
type processCore struct {
	kind    string
	opts    Options
	mu      sync.Mutex
	cmd     *exec.Cmd
	backup  []byte
	started bool
}

func newProcessCore(kind string, opts Options) *processCore {
	return &processCore{kind: kind, opts: opts}
}

func (p *processCore) Name() string { return p.kind }

func (p *processCore) Version(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, p.opts.Binary, "version").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("执行 %s version 失败: %w", p.opts.Binary, err)
	}
	// sing-box: "sing-box version 1.12.0"，xray: "Xray 1.8.24 ..."
	fields := strings.Fields(string(out))
	for _, field := range fields {
		if _, err := strconv.Atoi(strings.Split(field, ".")[0]); err == nil && strings.Contains(field, ".") {
			return strings.TrimPrefix(field, "v"), nil
		}
	}
	return strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0]), nil
}

// Apply 写配置 → 校验 → 重启（热重载在具体实现里覆盖）。
func (p *processCore) Apply(ctx context.Context, config []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(p.opts.ConfigPath), 0o755); err != nil {
		return err
	}

	// 备份当前配置，失败时回滚
	if current, err := os.ReadFile(p.opts.ConfigPath); err == nil {
		p.backup = current
	}

	tmp := p.opts.ConfigPath + ".tmp"
	if err := os.WriteFile(tmp, config, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, p.opts.ConfigPath); err != nil {
		return err
	}

	if err := p.check(ctx); err != nil {
		p.rollback()
		return fmt.Errorf("配置校验失败: %w", err)
	}
	return p.Restart(ctx)
}

func (p *processCore) rollback() {
	if p.backup == nil {
		return
	}
	_ = os.WriteFile(p.opts.ConfigPath, p.backup, 0o600)
}

// check 调用内核自带的配置校验子命令。
func (p *processCore) check(ctx context.Context) error {
	var args []string
	if p.kind == "xray" {
		args = []string{"run", "-test", "-c", p.opts.ConfigPath}
	} else {
		args = []string{"check", "-c", p.opts.ConfigPath}
	}
	out, err := exec.CommandContext(ctx, p.opts.Binary, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (p *processCore) Restart(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.restartLocked()
}

func (p *processCore) restartLocked() error {
	if p.cmd != nil && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
		_, _ = p.cmd.Process.Wait()
	}
	cmd := exec.Command(p.opts.Binary, "run", "-c", p.opts.ConfigPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	p.cmd = cmd
	p.started = true
	return nil
}

func (p *processCore) Alive(ctx context.Context) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil || p.cmd.Process == nil {
		return false
	}
	return p.cmd.ProcessState == nil || p.cmd.ProcessState.Exited() == false
}

func (p *processCore) Stop(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil || p.cmd.Process == nil {
		return nil
	}
	if err := p.cmd.Process.Signal(os.Interrupt); err != nil {
		return err
	}
	p.started = false
	return nil
}

func (p *processCore) Stats(ctx context.Context) ([]model.UserStat, error) {
	return nil, fmt.Errorf("%s: Stats 未实现", p.kind)
}

func (p *processCore) OnlineUsers(ctx context.Context) (int, error) {
	return 0, nil
}
