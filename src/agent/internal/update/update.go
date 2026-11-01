// Package update 实现自更新：下载 → 校验 sha256 → 校验 ed25519 签名 → 原子替换 → 失败回滚。
package update

import (
	"context"
	"errors"

	"sparrow/agent/internal/config"
	"sparrow/agent/internal/model"
)

type Release struct {
	Version string            `json:"version"`
	Channel string            `json:"channel"`
	Assets  map[string]string `json:"assets"`  // arch → 下载地址
	SHA256  map[string]string `json:"sha256"`  // arch → 校验值
	Sig     string            `json:"signature"`
}

// Check 查询面板/GitHub/自定义源上的最新版本。
func Check(ctx context.Context, cfg *config.Config) (*Release, error) {
	return nil, errors.New("自更新尚未实现（见 docs/architecture/agent-cli.md §9）")
}

// Apply 下载并替换当前二进制；currentBin 为 os.Executable()。
func Apply(ctx context.Context, cfg *config.Config, currentBin string, release *Release) error {
	return errors.New("自更新尚未实现（见 docs/architecture/agent-cli.md §9）")
}

// CurrentVersion 返回当前版本号。
func CurrentVersion() string { return model.Version }
