package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strings"
)

// githubAPIBase 单独抽出来是为了测试可以指向 httptest，不需要联网。
var githubAPIBase = "https://api.github.com"

// githubRelease 只声明用得到的字段。
type githubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Prerelease  bool   `json:"prerelease"`
	Draft       bool   `json:"draft"`
	PublishedAt string `json:"published_at"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int64  `json:"size"`
		Digest             string `json:"digest"` // 新版 GitHub API 提供 "sha256:…"
	} `json:"assets"`
}

var repoRe = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// parseRepo 从 "owner/repo"、https://github.com/owner/repo(.git) 里取出 owner/repo。
func parseRepo(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("update.source=github 需要把 update.custom_url 配成 owner/repo 或仓库 URL")
	}
	trimmed := strings.TrimSuffix(raw, "/")
	trimmed = strings.TrimSuffix(trimmed, ".git")
	if i := strings.Index(trimmed, "github.com/"); i >= 0 {
		trimmed = trimmed[i+len("github.com/"):]
	}
	trimmed = strings.TrimPrefix(trimmed, "repos/")
	if !repoRe.MatchString(trimmed) {
		return "", fmt.Errorf("无法从 %q 解析 owner/repo", raw)
	}
	return trimmed, nil
}

// fetchGitHubRelease 调用 /repos/<owner>/<repo>/releases/latest，归一化成 Release。
//
// 资产命名约定：sparrow-agent-<os>-<arch>（与 make cross 一致）。
// sha256 来源优先级：asset.digest（GitHub 新 API）→ checksums.txt/sha256sums.txt → <asset>.sha256。
// 都拿不到就报错——安装/升级必须能校验完整性。
//
// 未认证请求有 60 次/小时的限流；可用 GITHUB_TOKEN / GH_TOKEN 环境变量提升额度。
func fetchGitHubRelease(ctx context.Context, repoRef, channel string) (*Release, error) {
	repo, err := parseRepo(repoRef)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", strings.TrimRight(githubAPIBase, "/"), repo)

	ctx, cancel := context.WithTimeout(ctx, manifestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("构造 GitHub 请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "sparrow-agent/"+CurrentVersion())
	if token := githubToken(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 GitHub Release 失败 %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("GitHub 仓库 %s 还没有正式 Release（或不存在）", repo)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("请求 GitHub Release 失败 %s: HTTP %d %s", apiURL, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var gh githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxManifestBytes)).Decode(&gh); err != nil {
		return nil, fmt.Errorf("解析 GitHub Release 失败: %w", err)
	}
	if gh.Draft {
		return nil, fmt.Errorf("GitHub Release %s 是草稿，未发布", gh.TagName)
	}

	version := normalizeTag(gh.TagName)
	if version == "" {
		return nil, fmt.Errorf("GitHub Release tag %q 无法解析出版本号", gh.TagName)
	}

	key := PlatformKey()
	assetName := "sparrow-agent-" + key

	var (
		assetURL string
		digest   string
	)
	for _, a := range gh.Assets {
		switch strings.ToLower(a.Name) {
		case strings.ToLower(assetName):
			assetURL = a.BrowserDownloadURL
			digest = normalizeDigest(a.Digest)
		}
	}
	if assetURL == "" {
		return nil, fmt.Errorf("%w: GitHub Release %s 缺少资产 %s", ErrUnsupportedPlatform, gh.TagName, assetName)
	}

	release := &Release{
		Version: version,
		Channel: "stable",
		Assets:  map[string]string{key: assetURL},
		SHA256:  map[string]string{},
	}
	if gh.Prerelease {
		release.Channel = "beta"
	}
	if c := strings.TrimSpace(channel); c != "" {
		release.Channel = c
	}

	sum := digest
	if sum == "" {
		sum = lookupChecksumAsset(ctx, gh, assetName)
	}
	if sum == "" {
		return nil, fmt.Errorf("GitHub Release %s 没有 %s 的 sha256（asset digest / checksums.txt 均缺失），拒绝升级", gh.TagName, assetName)
	}
	release.SHA256[key] = sum
	release.Sig = lookupSignatureAsset(ctx, gh)
	if release.Sig == "" {
		slog.Debug("GitHub Release 未附带签名", "tag", gh.TagName)
	}
	return release, nil
}

// checksumAssetNames 是常见的校验和文件名（不区分大小写）。
var checksumAssetNames = map[string]bool{
	"checksums.txt":    true,
	"sha256sums.txt":   true,
	"sha256sum.txt":    true,
	"sha256sums":       true,
	"checksums.sha256": true,
}

// lookupChecksumAsset 从 Release 的校验和资产里挑出目标文件的 sha256。
func lookupChecksumAsset(ctx context.Context, gh githubRelease, assetName string) string {
	for _, a := range gh.Assets {
		name := strings.ToLower(a.Name)
		switch {
		case checksumAssetNames[name]:
			body, err := fetchSmallText(ctx, a.BrowserDownloadURL)
			if err != nil {
				slog.Warn("读取 checksums 失败", "asset", a.Name, "err", err)
				continue
			}
			if sum := parseChecksums(body, assetName); sum != "" {
				return sum
			}
		case name == strings.ToLower(assetName)+".sha256":
			body, err := fetchSmallText(ctx, a.BrowserDownloadURL)
			if err != nil {
				slog.Warn("读取 .sha256 失败", "asset", a.Name, "err", err)
				continue
			}
			if sum := parseChecksums(body, assetName); sum != "" {
				return sum
			}
		}
	}
	return ""
}

// parseChecksums 兼容 `hex  name`、`hex *name`、以及只有 hex 的文件。
func parseChecksums(body, assetName string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		sum := strings.ToLower(fields[0])
		if !isHex64(sum) {
			continue
		}
		if len(fields) == 1 {
			return sum // 纯 hex 文件（<asset>.sha256）
		}
		name := strings.TrimPrefix(fields[len(fields)-1], "*")
		name = strings.TrimPrefix(name, "./")
		if strings.EqualFold(name, assetName) {
			return sum
		}
	}
	return ""
}

// lookupSignatureAsset 找 signature.txt / <asset>.sig 这类签名资产。
func lookupSignatureAsset(ctx context.Context, gh githubRelease) string {
	for _, a := range gh.Assets {
		switch strings.ToLower(a.Name) {
		case "signature.txt", "signature", "latest.json.sig", "sha256.sig":
			body, err := fetchSmallText(ctx, a.BrowserDownloadURL)
			if err != nil {
				slog.Warn("读取签名资产失败", "asset", a.Name, "err", err)
				continue
			}
			return strings.TrimSpace(body)
		}
	}
	return ""
}

func fetchSmallText(ctx context.Context, url string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, manifestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "sparrow-agent/"+CurrentVersion())

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// normalizeTag 把 agent/v0.2.0、v0.2.0、0.2.0 统一成 0.2.0。
func normalizeTag(tag string) string {
	tag = strings.TrimSpace(tag)
	if i := strings.LastIndex(tag, "/"); i >= 0 {
		tag = tag[i+1:] // agent/v0.2.0
	}
	tag = strings.TrimPrefix(tag, "v")
	tag = strings.TrimPrefix(tag, "V")
	if !isSemver(tag) {
		return ""
	}
	return tag
}

// normalizeDigest 把 GitHub 的 "sha256:abc…" 转成小写 hex。
func normalizeDigest(d string) string {
	d = strings.ToLower(strings.TrimSpace(d))
	d = strings.TrimPrefix(d, "sha256:")
	if !isHex64(d) {
		return ""
	}
	return d
}

func githubToken() string {
	for _, key := range []string{"GITHUB_TOKEN", "GH_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}
