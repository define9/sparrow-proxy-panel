// Package logger 负责 slog 结构化日志的初始化（JSON 输出 + 可选的日志文件轮转）。
package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// 默认日志文件大小上限（超过后轮转）。
const defaultMaxSize = 16 << 20

// Options 是日志初始化参数。
type Options struct {
	// Level 日志级别：debug / info / warn / error
	Level string
	// File 日志文件路径（为空则只输出到 stdout）
	File string
	// MaxSize 单个日志文件大小上限（字节）
	MaxSize int64
}

// New 按参数创建 slog Logger。
//
// 日志以 JSON 格式输出；配置了日志文件时同时写文件（按大小轮转）。
// **密码 / 密钥 / token 禁止写入日志**，调用方需自行脱敏。
func New(opts Options) (*slog.Logger, error) {
	log, _, err := NewWithLevelVar(opts)
	return log, err
}

// NewWithLevelVar 与 New 相同，但额外返回可动态调整的级别变量
// （面板下发 set_log_level 命令时使用）。
func NewWithLevelVar(opts Options) (*slog.Logger, *slog.LevelVar, error) {
	level, err := ParseLevel(opts.Level)
	if err != nil {
		return nil, nil, err
	}
	writers := []io.Writer{os.Stdout}
	var rotating *rotatingWriter
	if strings.TrimSpace(opts.File) != "" {
		rotating, err = newRotatingWriter(opts.File, opts.MaxSize)
		if err != nil {
			return nil, nil, err
		}
		writers = append(writers, rotating)
	}
	var levelVar slog.LevelVar
	levelVar.Set(level)
	handler := slog.NewJSONHandler(io.MultiWriter(writers...), &slog.HandlerOptions{Level: &levelVar})
	return slog.New(handler), &levelVar, nil
}

// ParseLevel 解析日志级别。
func ParseLevel(level string) (slog.Level, error) {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "", "info":
		return slog.LevelInfo, nil
	case "debug":
		return slog.LevelDebug, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("logger: 非法日志级别 %q", level)
	}
}

// rotatingWriter 是按大小轮转的日志文件写入器。
type rotatingWriter struct {
	mu      sync.Mutex
	path    string
	maxSize int64
	file    *os.File
	size    int64
}

// newRotatingWriter 打开（必要时创建）日志文件。
func newRotatingWriter(path string, maxSize int64) (*rotatingWriter, error) {
	if maxSize <= 0 {
		maxSize = defaultMaxSize
	}
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("logger: 创建日志目录失败: %w", err)
		}
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return nil, fmt.Errorf("logger: 打开日志文件失败: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("logger: 读取日志文件信息失败: %w", err)
	}
	return &rotatingWriter{path: path, maxSize: maxSize, file: file, size: info.Size()}, nil
}

// Write 写入日志，超过上限时轮转。
func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.size+int64(len(p)) > w.maxSize {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}

// rotate 轮转日志文件（保留 1 份历史）。
func (w *rotatingWriter) rotate() error {
	if err := w.file.Close(); err != nil {
		return err
	}
	backup := w.path + ".1"
	_ = os.Remove(backup)
	if err := os.Rename(w.path, backup); err != nil {
		return err
	}
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return err
	}
	w.file = file
	w.size = 0
	return nil
}

// Close 关闭日志文件。
func (w *rotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}
