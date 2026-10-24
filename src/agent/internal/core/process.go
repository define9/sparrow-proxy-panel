package core

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// supervisor 负责内核进程的启动、崩溃拉起与优雅停止。
//
// 进程意外退出时按指数退避自动拉起（30s → 1m → 5m 上限），
// 停止时先发 SIGTERM，宽限期后发 SIGKILL。
type supervisor struct {
	binary     string
	args       []string
	workDir    string
	log        *slog.Logger
	maxBackoff time.Duration

	mu       sync.Mutex
	cmd      *exec.Cmd
	stopping bool
	exited   chan struct{}
	running  bool
	// restartRequested 表示收到了一次显式重启请求（跳过退避，立即重启）。
	restartRequested bool
}

// newSupervisor 创建进程守护器。
func newSupervisor(binary string, args []string, workDir string, log *slog.Logger, maxBackoff time.Duration) *supervisor {
	if maxBackoff <= 0 {
		maxBackoff = 5 * time.Minute
	}
	if log == nil {
		log = slog.Default()
	}
	return &supervisor{
		binary:     binary,
		args:       args,
		workDir:    workDir,
		log:        log,
		maxBackoff: maxBackoff,
		exited:     make(chan struct{}),
	}
}

// Start 启动内核进程并在后台守护（崩溃自动拉起）。
func (s *supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return errors.New("core: 内核进程已在运行")
	}
	s.running = true
	s.stopping = false
	s.mu.Unlock()

	go s.supervise(ctx)
	return nil
}

// supervise 是进程生命周期的主循环：拉起 → 等待退出 → 退避后重新拉起。
func (s *supervisor) supervise(ctx context.Context) {
	attempt := 0
	for {
		if ctx.Err() != nil || s.isStopping() {
			s.markStopped()
			return
		}
		cmd, err := s.spawn(ctx)
		if err != nil {
			attempt++
			delay := backoffDelay(attempt, s.maxBackoff)
			s.log.Error("内核进程启动失败", "attempt", attempt, "retry_in", delay.String(), "error", err.Error())
			if !s.sleep(ctx, delay) {
				s.markStopped()
				return
			}
			continue
		}
		attempt = 0
		s.log.Info("内核进程已启动", "pid", cmd.Process.Pid, "binary", s.binary)
		err = cmd.Wait()
		if ctx.Err() != nil || s.isStopping() {
			s.markStopped()
			return
		}
		if s.takeRestartRequest() {
			s.log.Info("内核进程收到重启请求，立即拉起")
			attempt = 0
			continue
		}
		attempt++
		delay := backoffDelay(attempt, s.maxBackoff)
		s.log.Error("内核进程异常退出，准备拉起", "attempt", attempt, "retry_in", delay.String(), "error", errString(err))
		if !s.sleep(ctx, delay) {
			s.markStopped()
			return
		}
	}
}

// spawn 启动一次内核进程。
func (s *supervisor) spawn(ctx context.Context) (*exec.Cmd, error) {
	if s.binary == "" {
		return nil, errors.New("core: 未配置内核可执行文件")
	}
	cmd := exec.CommandContext(ctx, s.binary, s.args...)
	if s.workDir != "" {
		cmd.Dir = s.workDir
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cmd = cmd
	s.mu.Unlock()
	return cmd, nil
}

// Restart 请求立即重启内核进程（跳过退避）。
func (s *supervisor) Restart() {
	s.mu.Lock()
	s.restartRequested = true
	cmd := s.cmd
	s.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Signal(syscall.SIGTERM)
	}
}

// takeRestartRequest 取出并清空重启请求标记。
func (s *supervisor) takeRestartRequest() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	req := s.restartRequested
	s.restartRequested = false
	return req
}

// Stop 停止内核进程（先 SIGTERM，宽限期后 SIGKILL）。
func (s *supervisor) Stop(ctx context.Context) {
	s.mu.Lock()
	s.stopping = true
	cmd := s.cmd
	s.mu.Unlock()

	if cmd == nil || cmd.Process == nil {
		s.markStopped()
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)

	select {
	case <-s.exited:
	case <-ctx.Done():
		_ = cmd.Process.Signal(syscall.SIGKILL)
	case <-time.After(10 * time.Second):
		_ = cmd.Process.Signal(syscall.SIGKILL)
	}
	s.markStopped()
}

// Alive 返回进程是否在运行。
func (s *supervisor) Alive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running && s.cmd != nil && s.cmd.ProcessState == nil
}

// isStopping 返回是否正在停止。
func (s *supervisor) isStopping() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stopping
}

// markStopped 标记进程已停止。
func (s *supervisor) markStopped() {
	s.mu.Lock()
	s.running = false
	s.cmd = nil
	s.mu.Unlock()
	select {
	case <-s.exited:
	default:
		close(s.exited)
	}
}

// sleep 等待一段时间；ctx 取消时返回 false。
func (s *supervisor) sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// backoffDelay 计算第 attempt 次失败后的退避时长（30s、1m、5m…）。
func backoffDelay(attempt int, max time.Duration) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := 30 * time.Second
	for i := 1; i < attempt; i++ {
		delay *= 2
		if delay >= max {
			return max
		}
	}
	if delay > max {
		return max
	}
	return delay
}

// errString 把错误转成可读字符串。
func errString(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("%v", err)
}
