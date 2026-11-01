// Package logger 统一 slog 配置（JSON 输出，字段与面板日志检索对齐）。
package logger

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

// New 按配置的级别与文件返回 logger；文件为空时只写 stdout。
func New(level, file string) (*slog.Logger, io.Closer, error) {
	var writer io.Writer = os.Stdout
	var closer io.Closer = io.NopCloser(nil)

	if file != "" {
		f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
		if err != nil {
			return nil, nil, err
		}
		writer = io.MultiWriter(os.Stdout, f)
		closer = f
	}

	opts := &slog.HandlerOptions{Level: parseLevel(level)}
	return slog.New(slog.NewJSONHandler(writer, opts)), closer, nil
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(raw) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
