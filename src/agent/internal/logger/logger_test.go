package logger

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestParseLevel 校验日志级别解析。
func TestParseLevel(t *testing.T) {
	cases := map[string]slog.Level{
		"":      slog.LevelInfo,
		"info":  slog.LevelInfo,
		"debug": slog.LevelDebug,
		"warn":  slog.LevelWarn,
		"ERROR": slog.LevelError,
	}
	for input, want := range cases {
		got, err := ParseLevel(input)
		if err != nil {
			t.Fatalf("解析 %q 失败: %v", input, err)
		}
		if got != want {
			t.Fatalf("级别 %q 不对: %v", input, got)
		}
	}
	if _, err := ParseLevel("trace"); err == nil {
		t.Fatal("非法级别应当报错")
	}
}

// TestNewWritesJSONFile 校验日志文件以 JSON 写入。
func TestNewWritesJSONFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.log")
	log, levelVar, err := NewWithLevelVar(Options{Level: "info", File: path})
	if err != nil {
		t.Fatalf("创建日志器失败: %v", err)
	}
	log.Info("hello", "key", "value")
	levelVar.Set(slog.LevelDebug)
	log.Debug("debug message")

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取日志失败: %v", err)
	}
	content := string(raw)
	if !strings.Contains(content, `"msg":"hello"`) {
		t.Fatalf("日志不是 JSON 格式: %s", content)
	}
	if !strings.Contains(content, `"key":"value"`) {
		t.Fatalf("日志缺少字段: %s", content)
	}
	if !strings.Contains(content, `"msg":"debug message"`) {
		t.Fatalf("动态级别未生效: %s", content)
	}
}

// TestRotatingWriter 校验日志文件按大小轮转。
func TestRotatingWriter(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.log")
	w, err := newRotatingWriter(path, 64)
	if err != nil {
		t.Fatalf("创建写入器失败: %v", err)
	}
	payload := []byte(strings.Repeat("x", 32))
	for i := 0; i < 6; i++ {
		if _, err := w.Write(payload); err != nil {
			t.Fatalf("写入失败: %v", err)
		}
	}
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("未生成轮转文件: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("关闭失败: %v", err)
	}
}
