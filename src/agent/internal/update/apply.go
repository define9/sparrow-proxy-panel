package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"sparrow/agent/internal/config"
)

const (
	// maxDownloadBytes 是产物大小上限（100 MiB），防止被恶意源撑爆磁盘。
	maxDownloadBytes = 100 << 20
	// downloadTimeout 是单次下载的总超时。
	downloadTimeout = 5 * time.Minute
	// manifestTimeout 是拉清单/校验和/签名的超时。
	manifestTimeout = 30 * time.Second
	// maxManifestBytes 是清单 JSON 的大小上限（1 MiB）。
	maxManifestBytes = 1 << 20
)

// 可在测试里临时改小，避免跑满真实超时。
var (
	probeTimeout = 10 * time.Second
	httpClient   = &http.Client{Timeout: 0} // 超时由每个请求的 context 控制
)

// Apply 下载并替换当前二进制；currentBin 为 os.Executable()。
//
// 步骤（任一步失败都不会留下半成品文件或损坏当前二进制）：
//  1. 下载到 <bin>.new（流式落盘，上限 100MiB / 5 分钟）
//  2. 计算并比对 sha256，不一致删除临时文件并报错
//  3. 配置了 update.public_key 时校验 ed25519 签名（缺签名同样中止）
//  4. chmod 0755 → 当前二进制改名 <bin>.bak → 原子 rename 替换
//  5. 用 `--version` 探测新二进制，失败则回滚 .bak
//
// release.UpToDate 为 true 时是幂等 no-op（`sparrow-agent update` 在最新版本上直接返回成功）。
func Apply(ctx context.Context, cfg *config.Config, currentBin string, release *Release) error {
	if cfg == nil {
		return errors.New("update: cfg 不能为空")
	}
	if release == nil {
		return errors.New("update: release 不能为空")
	}
	if release.UpToDate {
		slog.Info("已是最新版本，跳过更新", "version", CurrentVersion())
		return nil
	}
	if err := validateRelease(release); err != nil {
		return err
	}
	if strings.TrimSpace(currentBin) == "" {
		return errors.New("update: currentBin 不能为空")
	}

	assetURL := release.AssetURL()
	expected := release.ExpectedSHA256()
	newPath := currentBin + ".new"
	bakPath := currentBin + ".bak"

	// 清掉上一次失败/中断留下的半成品。
	if err := removeIfExists(newPath); err != nil {
		return fmt.Errorf("清理临时文件 %s 失败: %w", newPath, err)
	}

	slog.Info("开始下载新版本",
		"version", release.Version, "platform", PlatformKey(), "url", assetURL)

	sum, size, err := downloadTo(ctx, assetURL, newPath)
	if err != nil {
		_ = removeIfExists(newPath)
		return err
	}
	slog.Info("下载完成", "bytes", size, "sha256", sum)

	if sum != expected {
		_ = removeIfExists(newPath)
		return fmt.Errorf("%w：期望 %s，实际 %s（已删除临时文件）", ErrChecksumMismatch, expected, sum)
	}
	slog.Info("sha256 校验通过", "sha256", sum)

	if pubKey := strings.TrimSpace(cfg.Update.PublicKey); pubKey != "" {
		if strings.TrimSpace(release.Sig) == "" {
			_ = removeIfExists(newPath)
			return ErrSignatureRequired
		}
		if err := VerifySHA256JSON(pubKey, release.SHA256, release.Sig); err != nil {
			_ = removeIfExists(newPath)
			return err
		}
		slog.Info("ed25519 验签通过")
	} else {
		slog.Warn("未配置 update.public_key，跳过签名校验（仅依赖 sha256 与 HTTPS）")
	}

	if err := os.Chmod(newPath, 0o755); err != nil {
		_ = removeIfExists(newPath)
		return fmt.Errorf("设置可执行权限失败: %w", err)
	}

	// 旧 .bak 只作为上一版本；本轮升级覆盖它。
	if err := removeIfExists(bakPath); err != nil {
		_ = removeIfExists(newPath)
		return fmt.Errorf("清理旧备份 %s 失败: %w", bakPath, err)
	}
	if err := os.Rename(currentBin, bakPath); err != nil {
		_ = removeIfExists(newPath)
		return fmt.Errorf("备份当前二进制失败: %w", err)
	}
	if err := os.Rename(newPath, currentBin); err != nil {
		// 尽力把旧二进制放回去。
		_ = os.Rename(bakPath, currentBin)
		_ = removeIfExists(newPath)
		return fmt.Errorf("替换二进制失败，已回滚: %w", err)
	}
	slog.Info("二进制已替换",
		"path", currentBin, "backup", bakPath, "from", CurrentVersion(), "to", release.Version)

	if err := probe(ctx, currentBin); err != nil {
		if rbErr := rollback(currentBin, bakPath); rbErr != nil {
			return fmt.Errorf("新版本 --version 探测失败（%v），且回滚失败: %w", err, rbErr)
		}
		return fmt.Errorf("新版本 --version 探测失败，已回滚到 %s: %w", CurrentVersion(), err)
	}
	slog.Info("升级完成，请重启服务使新版本生效",
		"version", release.Version, "restart", "systemctl restart sparrow-agent")
	return nil
}

// downloadTo 流式下载到 dest，同时计算 sha256。
func downloadTo(ctx context.Context, url, dest string) (string, int64, error) {
	if strings.TrimSpace(url) == "" {
		return "", 0, errors.New("下载地址为空")
	}

	ctx, cancel := context.WithTimeout(ctx, downloadTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", 0, fmt.Errorf("构造下载请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "sparrow-agent/"+CurrentVersion())
	req.Header.Set("Accept", "application/octet-stream")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("下载失败 %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("下载失败 %s: HTTP %d", url, resp.StatusCode)
	}
	if resp.ContentLength > maxDownloadBytes {
		return "", 0, fmt.Errorf("产物 %d 字节超过上限 %d 字节，拒绝下载", resp.ContentLength, maxDownloadBytes)
	}

	file, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return "", 0, fmt.Errorf("创建临时文件 %s 失败: %w", dest, err)
	}

	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(resp.Body, maxDownloadBytes+1))
	syncErr := file.Sync()
	closeErr := file.Close()

	switch {
	case copyErr != nil:
		return "", written, fmt.Errorf("写入临时文件失败（已写入 %d 字节）: %w", written, copyErr)
	case written > maxDownloadBytes:
		return "", written, fmt.Errorf("产物超过 %d 字节上限，拒绝安装", maxDownloadBytes)
	case syncErr != nil:
		return "", written, fmt.Errorf("落盘失败: %w", syncErr)
	case closeErr != nil:
		return "", written, fmt.Errorf("关闭临时文件失败: %w", closeErr)
	}

	sum := hex.EncodeToString(hash.Sum(nil))
	return sum, written, nil
}

// probe 运行 `<bin> --version` 做自检，要求退出码 0 且输出非空。
func probe(ctx context.Context, bin string) error {
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	cmd := exec.CommandContext(probeCtx, bin, "--version")
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		return fmt.Errorf("执行 %s --version 失败: %w（输出: %s）", bin, err, text)
	}
	if text == "" {
		return fmt.Errorf("%s --version 没有输出", bin)
	}
	slog.Info("新版本自检通过", "output", text)
	return nil
}

// rollback 用 .bak 恢复上一个版本；成功后删除 .bak。
func rollback(currentBin, bakPath string) error {
	if err := removeIfExists(currentBin); err != nil {
		return fmt.Errorf("删除损坏的新二进制失败: %w", err)
	}
	if err := os.Rename(bakPath, currentBin); err != nil {
		return fmt.Errorf("恢复备份 %s 失败: %w", bakPath, err)
	}
	slog.Warn("已回滚到上一版本", "path", currentBin, "restored_from", bakPath)
	return nil
}

func removeIfExists(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
