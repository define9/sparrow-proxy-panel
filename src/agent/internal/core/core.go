// Package core 抽象代理内核（sing-box / Xray）的管理能力：
// 应用配置、重启、版本查询、流量统计，以及内核进程的守护（崩溃拉起）。
package core

import (
	"context"
	"errors"
	"fmt"
)

// ErrNotRunning 表示内核进程未运行。
var ErrNotRunning = errors.New("core: 内核未运行")

// UserStat 是单个用户（内核中的 email 标签）的流量计数，单位为**字节**。
type UserStat struct {
	// Upload 上行字节数
	Upload uint64 `json:"upload"`
	// Download 下行字节数
	Download uint64 `json:"download"`
}

// Stats 是一次流量采集的结果，单位为**字节**。
type Stats struct {
	// Users 按内核 email 标签聚合的用户流量
	Users map[string]UserStat `json:"users"`
	// TotalUpload 全局上行字节数
	TotalUpload uint64 `json:"totalUpload"`
	// TotalDownload 全局下行字节数
	TotalDownload uint64 `json:"totalDownload"`
	// OnlineUsers 当前在线连接对应的用户数（尽力而为）
	OnlineUsers int `json:"onlineUsers"`
}

// UserRule 是面板下发的用户规则。
type UserRule struct {
	// Email 内核中的用户标识（email 标签）
	Email string `json:"email"`
	// Uid 面板侧的用户数字 ID
	Uid int64 `json:"uid"`
	// Limit 流量上限（字节），0 表示不限
	Limit int64 `json:"limit"`
	// DownloadSpeed 下行限速（bps），0 表示不限
	DownloadSpeed int64 `json:"downloadSpeed"`
	// UploadSpeed 上行限速（bps），0 表示不限
	UploadSpeed int64 `json:"uploadSpeed"`
	// DeviceLimit 设备/并发连接数上限，0 表示不限
	DeviceLimit int64 `json:"deviceLimit"`
	// Enabled 是否放行
	Enabled bool `json:"enabled"`
}

// Certificate 是面板下发的证书。
type Certificate struct {
	Name string `json:"name"`
	Cert string `json:"cert"`
	Key  string `json:"key"`
}

// Bundle 是一次配置下发的完整内容。
type Bundle struct {
	// Version 配置版本号
	Version int64 `json:"version"`
	// Core 内核类型（sing-box / xray）
	Core string `json:"core"`
	// Config 内核配置本体（JSON 对象）
	Config map[string]any `json:"config"`
	// Rules 用户规则
	Rules []UserRule `json:"rules"`
	// Certificates 证书
	Certificates []Certificate `json:"certificates"`
	// Reload 是否需要重载内核（false 表示仅需新增规则）
	Reload bool `json:"reload"`
}

// Core 是内核抽象。
//
// 实现方：singbox（真实内核）与 fake（测试用）。
type Core interface {
	// ApplyConfig 应用一份新的配置；失败时实现方需要自行回滚。
	ApplyConfig(ctx context.Context, bundle *Bundle) error
	// Restart 重启内核进程。
	Restart(ctx context.Context) error
	// Version 返回内核版本号。
	Version(ctx context.Context) (string, error)
	// Stats 采集流量统计（字节）。
	Stats(ctx context.Context) (Stats, error)
	// Alive 返回内核进程是否存活。
	Alive() bool
	// Close 停止内核并释放资源。
	Close() error
}

// Options 是内核的构造参数。
type Options struct {
	// Type 内核类型（sing-box / xray）
	Type string
	// Binary 内核可执行文件路径
	Binary string
	// ConfigPath 内核配置文件路径
	ConfigPath string
	// ClashAPI 内核本地管理 API 地址（sing-box 的 experimental.clash_api），为空表示不使用
	ClashAPI string
	// Dir 内核运行目录（证书、日志等落盘位置）
	Dir string
	// MaxBackoff 进程守护的重启退避上限
	MaxBackoff int
}

// New 按类型创建内核实现。
func New(opts Options) (Core, error) {
	switch opts.Type {
	case "sing-box":
		return NewSingBox(opts)
	case "xray":
		return NewSingBox(opts)
	case "fake", "":
		return NewFake(opts), nil
	default:
		return nil, fmt.Errorf("core: 不支持的内核类型 %q", opts.Type)
	}
}
