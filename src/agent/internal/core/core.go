// Package core 抽象内核（sing-box / xray）的进程管理与配置应用。
//
// Agent 只通过这个接口操作内核；具体实现在 singbox.go / xray.go。
package core

import (
	"context"
	"log/slog"

	"sparrow/agent/internal/model"
)

type Core interface {
	// Name 返回内核类型（sing-box / xray），用于心跳上报。
	Name() string
	// Version 返回内核版本号（来自 `binary version` 输出）。
	Version(ctx context.Context) (string, error)
	// Apply 原子写入配置并触发热重载；失败时回滚到上一份配置。
	Apply(ctx context.Context, config []byte) error
	// Restart 重启内核进程（进程守护由 Agent 主循环负责）。
	Restart(ctx context.Context) error
	// Stats 返回内核侧按 uid 的累计流量（不是增量）。
	Stats(ctx context.Context) ([]model.UserStat, error)
	// OnlineUsers 返回当前在线连接/用户数。
	OnlineUsers(ctx context.Context) (int, error)
	// Alive 表示内核进程是否在跑。
	Alive(ctx context.Context) bool
	// Stop 优雅停止内核（SIGTERM）。
	Stop(ctx context.Context) error
}

// Options 是构造内核管理器所需的参数。
type Options struct {
	Binary     string
	ConfigPath string
	// WorkDir 用于存放备份配置与运行时文件。
	WorkDir string
	// Logger 可选；为 nil 时用 slog.Default()。统计精度告警等写到这里。
	Logger *slog.Logger
}

// UserDirectory 是内核的可选能力：接收面板 rules.users 的 email → uid 映射。
//
// 主循环拿到配置后应先调用 BindUsers(kernel, resp.Rules.Users) 再 Apply；
// 内核配置里自带 uid 时（面板当前就是这么下发的）即使不调用也能正确归因。
type UserDirectory interface {
	SetUsers(users []model.ConfigUser)
}

// BindUsers 把面板下发的用户表绑定到内核；内核不支持时返回 false。
func BindUsers(c Core, users []model.ConfigUser) bool {
	directory, supported := c.(UserDirectory)
	if !supported {
		return false
	}
	directory.SetUsers(users)
	return true
}

// New 按类型构造内核管理器。
func New(kind string, opts Options) (Core, error) {
	switch kind {
	case "sing-box":
		return newSingBox(opts), nil
	case "xray":
		return newXray(opts), nil
	default:
		return newSingBox(opts), nil
	}
}
