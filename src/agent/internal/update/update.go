// Package update 实现自更新：下载 → 校验 sha256 → 校验 ed25519 签名 → 原子替换 → 失败回滚。
//
// 版本清单（latest.json，放在自有源上，例如 https://example.com/sparrow-agent/latest.json）：
//
//	{
//	  "version": "0.2.0",
//	  "channel": "stable",
//	  "assets":  { "linux-amd64": "https://example.com/sparrow-agent/0.2.0/sparrow-agent-linux-amd64" },
//	  "sha256":  { "linux-amd64": "…64 hex…" },
//	  "signature": "…base64(ed25519(sha256 字典的 canonical JSON))…"
//	}
//
// canonical JSON 规则：键按字母序，分隔符 "," / ":"，不含任何空白，键值均按 JSON 字符串转义，
// 例如 {"linux-amd64":"ab…","linux-arm64":"cd…"}。
package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"sparrow/agent/internal/config"
	"sparrow/agent/internal/model"
)

// Release 是版本清单（latest.json）的结构，也是 GitHub Releases 归一化后的结果。
type Release struct {
	Version string            `json:"version"`
	Channel string            `json:"channel"`
	Assets  map[string]string `json:"assets"` // 平台键（linux-amd64）→ 下载地址
	SHA256  map[string]string `json:"sha256"` // 平台键 → 64 位 hex
	Sig     string            `json:"signature"`

	// UpToDate 由 Check 填充：true 表示源上的版本不高于当前版本，无需更新。
	// Check 此时仍返回 (release, nil)，方便 `update --check` 区分：
	//   - err != nil          → 检查失败
	//   - UpToDate == true    → 已是最新
	//   - UpToDate == false   → 有新版本
	UpToDate bool `json:"-"`
}

// PlatformKey 返回当前二进制的平台键，例如 linux-amd64、linux-armv7、darwin-arm64。
//
// 与 Makefile cross 产物命名保持一致：GOARCH=arm 的产物叫 linux-armv7。
func PlatformKey() string {
	goos, goarch := runtime.GOOS, runtime.GOARCH
	if goos == "linux" && goarch == "arm" {
		goarch = "armv7"
	}
	return goos + "-" + goarch
}

// AssetURL 返回清单里当前平台对应的下载地址。
func (r *Release) AssetURL() string {
	if r == nil {
		return ""
	}
	return strings.TrimSpace(r.Assets[PlatformKey()])
}

// ExpectedSHA256 返回清单里当前平台对应的 sha256（小写 hex）。
func (r *Release) ExpectedSHA256() string {
	if r == nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(r.SHA256[PlatformKey()]))
}

// CurrentVersion 返回当前版本号（编译期写入 model.Version）。
func CurrentVersion() string { return model.Version }

var (
	// ErrChecksumMismatch 表示下载内容与清单 sha256 不一致。
	ErrChecksumMismatch = errors.New("sha256 校验失败")
	// ErrSignatureRequired 表示配置了 public_key 但清单没有签名。
	ErrSignatureRequired = errors.New("清单缺少 signature，但配置了 update.public_key")
	// ErrSignatureInvalid 表示 ed25519 验签失败。
	ErrSignatureInvalid = errors.New("ed25519 签名校验失败")
	// ErrUnsupportedPlatform 表示清单里没有当前平台的产物。
	ErrUnsupportedPlatform = errors.New("清单中没有当前平台的产物")
)

// Check 查询面板/GitHub/自定义源上的最新版本。
//
// 语义（cmd update 依赖）：
//   - 源不可用、清单非法、没有当前平台产物 → 返回 error
//   - 源版本 ≤ 当前版本 → 返回 (release, nil) 且 release.UpToDate = true
//   - 有新版本 → 返回 (release, nil) 且 release.UpToDate = false
//
// source=panel 目前是占位：面板尚未提供 /api/v1/public/agent/release，这里必须显式报错，
// 不能假装成功，否则运维会以为集群已经能自动升级。
func Check(ctx context.Context, cfg *config.Config) (*Release, error) {
	if cfg == nil {
		return nil, errors.New("update: cfg 不能为空")
	}

	source := strings.ToLower(strings.TrimSpace(cfg.Update.Source))
	if source == "" {
		source = "panel"
	}

	var (
		release *Release
		err     error
	)
	switch source {
	case "panel":
		return nil, errors.New("面板源未实现：需要面板先提供 GET /api/v1/public/agent/release（docs/architecture/agent-cli.md §9）；" +
			"暂时请把 update.source 设为 custom-url（配 latest.json）或 github")
	case "custom-url":
		release, err = fetchManifest(ctx, cfg.Update.CustomURL)
	case "github":
		release, err = fetchGitHubRelease(ctx, cfg.Update.CustomURL, cfg.Update.Channel)
	default:
		return nil, fmt.Errorf("未知 update.source %q（支持 panel / github / custom-url）", cfg.Update.Source)
	}
	if err != nil {
		return nil, err
	}

	if err := validateRelease(release); err != nil {
		return nil, err
	}

	current := CurrentVersion()
	release.UpToDate = compareVersions(release.Version, current) <= 0
	if release.UpToDate {
		slog.Info("已是最新版本", "current", current, "source", release.Version)
	} else {
		slog.Info("发现新版本", "current", current, "latest", release.Version, "channel", release.Channel)
	}
	return release, nil
}

// validateRelease 检查清单是否完整：版本号、当前平台产物、sha256 格式。
func validateRelease(r *Release) error {
	if r == nil {
		return errors.New("清单为空")
	}
	if strings.TrimSpace(r.Version) == "" {
		return errors.New("清单缺少 version 字段")
	}
	if !isSemver(r.Version) {
		return fmt.Errorf("清单 version %q 不是合法的语义化版本", r.Version)
	}
	if r.AssetURL() == "" {
		return fmt.Errorf("%w: %s（可用：%s）", ErrUnsupportedPlatform, PlatformKey(), strings.Join(sortedKeys(r.Assets), ", "))
	}
	sum := r.ExpectedSHA256()
	if sum == "" {
		return fmt.Errorf("清单缺少 %s 的 sha256，拒绝下载（无法校验完整性）", PlatformKey())
	}
	if !isHex64(sum) {
		return fmt.Errorf("清单 %s 的 sha256 不是 64 位 hex: %q", PlatformKey(), sum)
	}
	return nil
}

// fetchManifest GET 一个 latest.json 并解析。
func fetchManifest(ctx context.Context, url string) (*Release, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil, errors.New("update.source=custom-url 需要配置 update.custom_url 指向 latest.json")
	}

	ctx, cancel := context.WithTimeout(ctx, manifestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构造清单请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "sparrow-agent/"+CurrentVersion())

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("拉取版本清单失败 %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("拉取版本清单失败 %s: HTTP %d %s", url, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var release Release
	dec := json.NewDecoder(io.LimitReader(resp.Body, maxManifestBytes))
	if err := dec.Decode(&release); err != nil {
		return nil, fmt.Errorf("解析版本清单失败 %s: %w", url, err)
	}
	normalize(&release)
	return &release, nil
}

// normalize 统一大小写/空白，避免清单手写出错导致误判。
func normalize(r *Release) {
	r.Version = strings.TrimSpace(r.Version)
	r.Channel = strings.TrimSpace(r.Channel)
	r.Sig = strings.TrimSpace(r.Sig)
	assets := make(map[string]string, len(r.Assets))
	for k, v := range r.Assets {
		assets[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
	}
	r.Assets = assets
	sums := make(map[string]string, len(r.SHA256))
	for k, v := range r.SHA256 {
		sums[strings.ToLower(strings.TrimSpace(k))] = strings.ToLower(strings.TrimSpace(v))
	}
	r.SHA256 = sums
}

// isSemver 粗校验：至少 major.minor.patch，允许 v 前缀与 -pre/+build。
func isSemver(v string) bool {
	nums, _, ok := parseVersion(v)
	return ok && len(nums) >= 1
}

// parseVersion 解析 v1.2.3-pre.1+build → ([1,2,3], ["pre","1"], true)。
func parseVersion(v string) ([]int, []string, bool) {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")
	if v == "" {
		return nil, nil, false
	}
	if i := strings.IndexByte(v, '+'); i >= 0 {
		v = v[:i]
	}
	var pre []string
	if i := strings.IndexByte(v, '-'); i >= 0 {
		pre = strings.Split(v[i+1:], ".")
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	nums := make([]int, 0, len(parts))
	for _, p := range parts {
		if p == "" {
			return nil, nil, false
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return nil, nil, false
		}
		nums = append(nums, n)
	}
	return nums, pre, true
}

// compareVersions 比较两个语义化版本：a>b 返回 1，a<b 返回 -1，相等返回 0。
//
// 非语义化版本（例如 dev、git describe 的 80a523a-dirty）一律视为 0.0.0-0，
// 也就是"比任何正式版本都旧"，这样从源码编译的二进制总能被升级。
func compareVersions(a, b string) int {
	an, apre, aok := parseVersion(a)
	bn, bpre, bok := parseVersion(b)
	if !aok {
		an, apre = []int{0, 0, 0}, []string{"0"}
	}
	if !bok {
		bn, bpre = []int{0, 0, 0}, []string{"0"}
	}

	for i := 0; i < len(an) || i < len(bn); i++ {
		var x, y int
		if i < len(an) {
			x = an[i]
		}
		if i < len(bn) {
			y = bn[i]
		}
		if x != y {
			if x > y {
				return 1
			}
			return -1
		}
	}

	// 有预发布标识的版本小于同号正式版本。
	switch {
	case len(apre) == 0 && len(bpre) == 0:
		return 0
	case len(apre) == 0:
		return 1
	case len(bpre) == 0:
		return -1
	}
	for i := 0; i < len(apre) || i < len(bpre); i++ {
		if i >= len(apre) {
			return -1
		}
		if i >= len(bpre) {
			return 1
		}
		x, y := apre[i], bpre[i]
		xn, xerr := strconv.Atoi(x)
		yn, yerr := strconv.Atoi(y)
		switch {
		case xerr == nil && yerr == nil:
			if xn != yn {
				if xn > yn {
					return 1
				}
				return -1
			}
		case xerr == nil:
			return -1 // 数字标识小于字母标识
		case yerr == nil:
			return 1
		default:
			if x != y {
				if x > y {
					return 1
				}
				return -1
			}
		}
	}
	return 0
}

func isHex64(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
