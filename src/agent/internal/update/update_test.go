package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"sparrow/agent/internal/config"
)

/* ------------------------------ 测试辅助 ------------------------------ */

const oldBinaryBody = "old-binary-from-0.1.0\n"

// probeScript 生成一个能被 `--version` 探测的假二进制。
func probeScript(version string) []byte {
	return []byte("#!/bin/sh\necho \"sparrow-agent " + version + "\"\n")
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func writeCurrentBinary(t *testing.T, dir string) string {
	t.Helper()
	bin := filepath.Join(dir, "sparrow-agent")
	if err := os.WriteFile(bin, []byte(oldBinaryBody), 0o755); err != nil {
		t.Fatalf("写入旧二进制失败: %v", err)
	}
	return bin
}

// releaseServer 起一个 httptest，同时提供 /latest.json 与 /download/<platform>。
// 清单可以在建好服务之后再设置，避免端口写死。
type releaseServer struct {
	*httptest.Server
	binary []byte

	mu       sync.Mutex
	manifest *Release
}

func newReleaseServer(t *testing.T, body []byte) *releaseServer {
	t.Helper()
	rs := &releaseServer{binary: body}
	mux := http.NewServeMux()
	mux.HandleFunc("/download/"+PlatformKey(), func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(rs.binary)
	})
	mux.HandleFunc("/latest.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rs.getManifest())
	})
	rs.Server = httptest.NewServer(mux)
	t.Cleanup(rs.Close)
	return rs
}

func (rs *releaseServer) setManifest(rel Release) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	rs.manifest = &rel
}

func (rs *releaseServer) getManifest() *Release {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	if rs.manifest == nil {
		return &Release{}
	}
	return rs.manifest
}

// manifestFor 造一个指向 httptest 的合法清单。
func manifestFor(t *testing.T, srv *releaseServer, version string) Release {
	t.Helper()
	key := PlatformKey()
	return Release{
		Version: version,
		Channel: "stable",
		Assets:  map[string]string{key: srv.URL + "/download/" + key},
		SHA256:  map[string]string{key: sha256Hex(srv.binary)},
	}
}

func testConfig(customURL, publicKey string) *config.Config {
	return &config.Config{
		Panel: config.Panel{URL: "https://panel.example.com"},
		Update: config.Update{
			Enabled:   true,
			Channel:   "stable",
			Source:    "custom-url",
			CustomURL: customURL,
			PublicKey: publicKey,
		},
	}
}

func base64Pub(pub ed25519.PublicKey) string {
	return base64.StdEncoding.EncodeToString(pub)
}

func base64Stdenc(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

func pemPub(t *testing.T, pub ed25519.PublicKey) string {
	t.Helper()
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("序列化公钥失败: %v", err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
}

func keyPair(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("生成 ed25519 密钥失败: %v", err)
	}
	return pub, priv
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", path, err)
	}
	return string(b)
}

func assertNoFile(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("%s 不应存在（err=%v）", path, err)
	}
}

/* ------------------------------ Check ------------------------------ */

func TestCheckCustomURL(t *testing.T) {
	body := probeScript("0.9.0")
	srv := newReleaseServer(t, body)
	srv.setManifest(manifestFor(t, srv, "0.9.0"))

	got, err := Check(context.Background(), testConfig(srv.URL+"/latest.json", ""))
	if err != nil {
		t.Fatalf("Check 失败: %v", err)
	}
	if got.Version != "0.9.0" {
		t.Fatalf("版本应为 0.9.0，实际 %q", got.Version)
	}
	if got.UpToDate {
		t.Fatal("0.9.0 应比当前版本新")
	}
	if got.AssetURL() == "" || got.ExpectedSHA256() == "" {
		t.Fatalf("清单归一化失败: %+v", got)
	}
}

func TestCheckUpToDateIsNoError(t *testing.T) {
	body := probeScript(CurrentVersion())
	srv := newReleaseServer(t, body)
	srv.setManifest(manifestFor(t, srv, CurrentVersion()))

	got, err := Check(context.Background(), testConfig(srv.URL+"/latest.json", ""))
	if err != nil {
		t.Fatalf("已是最新版本时不应返回 error: %v", err)
	}
	if !got.UpToDate {
		t.Fatalf("同版本应标记 UpToDate=true，实际 %+v", got)
	}
}

func TestCheckPanelSourceNotImplemented(t *testing.T) {
	cfg := testConfig("", "")
	cfg.Update.Source = "panel"

	_, err := Check(context.Background(), cfg)
	if err == nil {
		t.Fatal("panel 源必须返回错误")
	}
	if !strings.Contains(err.Error(), "/api/v1/public/agent/release") {
		t.Fatalf("错误信息应指出缺失的面板接口，实际: %v", err)
	}
}

func TestCheckUnknownSource(t *testing.T) {
	cfg := testConfig("", "")
	cfg.Update.Source = "oss"
	if _, err := Check(context.Background(), cfg); err == nil {
		t.Fatal("未知 source 必须报错")
	}
}

func TestCheckRejectsMissingPlatformAsset(t *testing.T) {
	body := probeScript("0.2.0")
	srv := newReleaseServer(t, body)
	srv.setManifest(Release{
		Version: "0.2.0",
		Channel: "stable",
		Assets:  map[string]string{"plan9-mips": "http://example.com/x"},
		SHA256:  map[string]string{"plan9-mips": strings.Repeat("a", 64)},
	})

	_, err := Check(context.Background(), testConfig(srv.URL+"/latest.json", ""))
	if !errors.Is(err, ErrUnsupportedPlatform) {
		t.Fatalf("应返回 ErrUnsupportedPlatform，实际: %v", err)
	}
}

func TestCheckRejectsBadSHA256(t *testing.T) {
	body := probeScript("0.2.0")
	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0")
	manifest.SHA256[PlatformKey()] = "nothex"
	srv.setManifest(manifest)

	if _, err := Check(context.Background(), testConfig(srv.URL+"/latest.json", "")); err == nil {
		t.Fatal("非法 sha256 必须报错")
	}
}

func TestCheckRejectsBadVersion(t *testing.T) {
	body := probeScript("0.2.0")
	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "latest")
	srv.setManifest(manifest)

	if _, err := Check(context.Background(), testConfig(srv.URL+"/latest.json", "")); err == nil {
		t.Fatal("非语义化版本必须报错")
	}
}

func TestCheckHTMLInsteadOfJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>502</html>"))
	}))
	defer srv.Close()

	if _, err := Check(context.Background(), testConfig(srv.URL, "")); err == nil {
		t.Fatal("非 JSON 清单必须报错")
	}
}

func TestCheckGitHubRelease(t *testing.T) {
	oldBase := githubAPIBase
	defer func() { githubAPIBase = oldBase }()

	key := PlatformKey()
	assetName := "sparrow-agent-" + key

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/acme/sparrow/releases/latest" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name":   "agent/v0.9.0",
			"prerelease": false,
			"assets": []map[string]any{
				{
					"name":                 assetName,
					"browser_download_url": "http://example.com/" + assetName,
					"digest":               "sha256:" + strings.Repeat("ab", 32),
				},
			},
		})
	}))
	defer srv.Close()
	githubAPIBase = srv.URL

	cfg := testConfig("https://github.com/acme/sparrow", "")
	cfg.Update.Source = "github"

	got, err := Check(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Check github 失败: %v", err)
	}
	if got.Version != "0.9.0" {
		t.Fatalf("tag 解析错误: %q", got.Version)
	}
	if got.SHA256[key] != strings.Repeat("ab", 32) {
		t.Fatalf("digest 未被采纳: %v", got.SHA256)
	}
	if got.Channel != "stable" {
		t.Fatalf("channel 应为 stable，实际 %q", got.Channel)
	}
}

func TestCheckGitHubChecksumsFallback(t *testing.T) {
	oldBase := githubAPIBase
	defer func() { githubAPIBase = oldBase }()

	key := PlatformKey()
	assetName := "sparrow-agent-" + key
	sum := strings.Repeat("cd", 32)

	var base string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/acme/sparrow/releases/latest":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tag_name": "v0.9.1",
				"assets": []map[string]any{
					{"name": assetName, "browser_download_url": base + "/bin"},
					{"name": "checksums.txt", "browser_download_url": base + "/SHA256SUMS"},
				},
			})
		case "/SHA256SUMS":
			_, _ = fmt.Fprintf(w, "%s  %s\n", sum, assetName)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	githubAPIBase = srv.URL
	base = srv.URL

	cfg := testConfig("acme/sparrow", "")
	cfg.Update.Source = "github"

	got, err := Check(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Check github 失败: %v", err)
	}
	if got.SHA256[key] != sum {
		t.Fatalf("checksums.txt 未被采纳: %v", got.SHA256)
	}
}

func TestCheckGitHubMissingChecksumIsError(t *testing.T) {
	oldBase := githubAPIBase
	defer func() { githubAPIBase = oldBase }()

	assetName := "sparrow-agent-" + PlatformKey()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": "v0.9.1",
			"assets": []map[string]any{
				{"name": assetName, "browser_download_url": "http://example.com/bin"},
			},
		})
	}))
	defer srv.Close()
	githubAPIBase = srv.URL

	cfg := testConfig("acme/sparrow", "")
	cfg.Update.Source = "github"

	if _, err := Check(context.Background(), cfg); err == nil {
		t.Fatal("没有 sha256 时必须报错")
	}
}

/* ------------------------------ Apply ------------------------------ */

func TestApplyUpgradeSucceeds(t *testing.T) {
	body := probeScript("0.2.0")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0")

	if err := Apply(context.Background(), testConfig(srv.URL+"/latest.json", ""), bin, &manifest); err != nil {
		t.Fatalf("Apply 失败: %v", err)
	}

	if got := mustRead(t, bin); got != string(body) {
		t.Fatalf("新二进制内容不符: %q", got)
	}
	if got := mustRead(t, bin+".bak"); got != oldBinaryBody {
		t.Fatalf(".bak 应是旧版本内容，实际 %q", got)
	}
	info, err := os.Stat(bin)
	if err != nil {
		t.Fatalf("stat 失败: %v", err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("权限应为 0755，实际 %v", info.Mode().Perm())
	}
	assertNoFile(t, bin+".new")
}

func TestApplyChecksumMismatchAborts(t *testing.T) {
	body := probeScript("0.2.0")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0")
	manifest.SHA256[PlatformKey()] = strings.Repeat("0", 64)

	err := Apply(context.Background(), testConfig(srv.URL+"/latest.json", ""), bin, &manifest)
	if !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("应返回 ErrChecksumMismatch，实际: %v", err)
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("当前二进制被破坏: %q", got)
	}
	assertNoFile(t, bin+".new")
	assertNoFile(t, bin+".bak")
}

func TestApplyMissingSignatureAborts(t *testing.T) {
	body := probeScript("0.2.0")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0") // 无 signature

	pub, _ := keyPair(t)
	err := Apply(context.Background(), testConfig(srv.URL+"/latest.json", base64Pub(pub)), bin, &manifest)
	if !errors.Is(err, ErrSignatureRequired) {
		t.Fatalf("应返回 ErrSignatureRequired，实际: %v", err)
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("当前二进制被破坏: %q", got)
	}
	assertNoFile(t, bin+".new")
}

func TestApplyInvalidSignatureAborts(t *testing.T) {
	body := probeScript("0.2.0")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0")

	trustedPub, _ := keyPair(t)
	_, attackerPriv := keyPair(t)
	sig, err := SignSHA256JSON(attackerPriv, manifest.SHA256)
	if err != nil {
		t.Fatalf("签名失败: %v", err)
	}
	manifest.Sig = sig

	err = Apply(context.Background(), testConfig(srv.URL+"/latest.json", base64Pub(trustedPub)), bin, &manifest)
	if !errors.Is(err, ErrSignatureInvalid) {
		t.Fatalf("应返回 ErrSignatureInvalid，实际: %v", err)
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("当前二进制被破坏: %q", got)
	}
	assertNoFile(t, bin+".new")
}

func TestApplyValidSignatureSucceeds(t *testing.T) {
	body := probeScript("0.2.0")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, body)
	manifest := manifestFor(t, srv, "0.2.0")

	pub, priv := keyPair(t)
	sig, err := SignSHA256JSON(priv, manifest.SHA256)
	if err != nil {
		t.Fatalf("签名失败: %v", err)
	}
	manifest.Sig = sig

	// 同时验证 PEM 公钥写法。
	if err := Apply(context.Background(), testConfig(srv.URL+"/latest.json", pemPub(t, pub)), bin, &manifest); err != nil {
		t.Fatalf("Apply 失败: %v", err)
	}
	if got := mustRead(t, bin); got != string(body) {
		t.Fatalf("新二进制内容不符: %q", got)
	}
}

func TestApplyProbeFailureRollsBack(t *testing.T) {
	badBody := []byte("#!/bin/sh\nexit 7\n")
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, badBody)
	manifest := manifestFor(t, srv, "0.2.0")

	oldProbe := probeTimeout
	probeTimeout = 5 * time.Second
	defer func() { probeTimeout = oldProbe }()

	err := Apply(context.Background(), testConfig(srv.URL+"/latest.json", ""), bin, &manifest)
	if err == nil {
		t.Fatal("探测失败时必须返回错误")
	}
	if !strings.Contains(err.Error(), "回滚") {
		t.Fatalf("错误信息应说明已回滚，实际: %v", err)
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("回滚后应恢复旧二进制，实际 %q", got)
	}
	assertNoFile(t, bin+".new")
	assertNoFile(t, bin+".bak")
}

func TestApplyUpToDateIsNoop(t *testing.T) {
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	// 指向一个必失败的地址：只要真的去下载就会报错。
	cfg := testConfig("http://127.0.0.1:1/latest.json", "")
	rel := Release{Version: CurrentVersion(), UpToDate: true}

	if err := Apply(context.Background(), cfg, bin, &rel); err != nil {
		t.Fatalf("最新版本时应 no-op，实际: %v", err)
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("no-op 不应改动二进制: %q", got)
	}
}

func TestApplyRejectsHTTPError(t *testing.T) {
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusBadGateway)
	}))
	defer srv.Close()

	manifest := Release{
		Version: "0.2.0",
		Assets:  map[string]string{PlatformKey(): srv.URL + "/bin"},
		SHA256:  map[string]string{PlatformKey(): strings.Repeat("a", 64)},
	}
	if err := Apply(context.Background(), testConfig("", ""), bin, &manifest); err == nil {
		t.Fatal("HTTP 502 必须报错")
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("当前二进制被破坏: %q", got)
	}
	assertNoFile(t, bin+".new")
}

func TestApplyRejectsEmptyBinary(t *testing.T) {
	dir := t.TempDir()
	bin := writeCurrentBinary(t, dir)

	srv := newReleaseServer(t, nil)
	manifest := manifestFor(t, srv, "0.2.0")

	// 空文件 sha256 匹配，但探测会失败 → 回滚
	if err := Apply(context.Background(), testConfig("", ""), bin, &manifest); err == nil {
		t.Fatal("空产物必须因探测失败而报错")
	}
	if got := mustRead(t, bin); got != oldBinaryBody {
		t.Fatalf("回滚后应恢复旧二进制，实际 %q", got)
	}
}

/* --------------------------- canonical / 版本 --------------------------- */

func TestCanonicalSHA256JSON(t *testing.T) {
	sums := map[string]string{
		"linux-arm64":  "cd",
		"linux-amd64":  "ab",
		"darwin-arm64": "ef",
	}
	got := string(CanonicalSHA256JSON(sums))
	want := `{"darwin-arm64":"ef","linux-amd64":"ab","linux-arm64":"cd"}`
	if got != want {
		t.Fatalf("canonical JSON 不符\n got: %s\nwant: %s", got, want)
	}
	if strings.Contains(got, " ") {
		t.Fatal("canonical JSON 不能含空白")
	}
}

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"0.2.0", "0.1.0", 1},
		{"v0.2.0", "0.2.0", 0},
		{"1.0.0", "1.0.0", 0},
		{"1.10.0", "1.9.9", 1},
		{"0.2.0-rc.1", "0.2.0", -1},
		{"0.2.0-rc.2", "0.2.0-rc.1", 1},
		{"0.2.0+build.5", "0.2.0", 0},
		{"0.1.0", "dev", 1},
		{"0.1.0", "80a523a-dirty", 1},
	}
	for _, c := range cases {
		if got := compareVersions(c.a, c.b); got != c.want {
			t.Errorf("compareVersions(%q,%q)=%d，期望 %d", c.a, c.b, got, c.want)
		}
	}
}

func TestNormalizeTag(t *testing.T) {
	cases := map[string]string{
		"agent/v0.2.0": "0.2.0",
		"v0.2.0":       "0.2.0",
		"0.2.0":        "0.2.0",
		"nightly":      "",
	}
	for in, want := range cases {
		if got := normalizeTag(in); got != want {
			t.Errorf("normalizeTag(%q)=%q，期望 %q", in, got, want)
		}
	}
}

func TestParsePublicKeyVariants(t *testing.T) {
	pub, _ := keyPair(t)

	for name, raw := range map[string]string{
		"raw base64": base64Pub(pub),
		"prefixed":   "ed25519:" + base64Pub(pub),
		"PEM PKIX":   pemPub(t, pub),
		"raw no pad": strings.TrimRight(base64Pub(pub), "="),
	} {
		parsed, err := ParsePublicKey(raw)
		if err != nil {
			t.Fatalf("%s 解析失败: %v", name, err)
		}
		if !parsed.Equal(pub) {
			t.Fatalf("%s 解析结果不一致", name)
		}
	}

	if _, err := ParsePublicKey("ed25519:short"); err == nil {
		t.Fatal("非法公钥必须报错")
	}
}

func TestParsePrivateKeySeed(t *testing.T) {
	_, priv := keyPair(t)
	parsed, err := ParsePrivateKey(base64Stdenc(priv.Seed()))
	if err != nil {
		t.Fatalf("解析 seed 失败: %v", err)
	}
	if !parsed.Equal(priv) {
		t.Fatal("seed 还原的私钥不一致")
	}
}

func TestPlatformKeyFormat(t *testing.T) {
	key := PlatformKey()
	if !strings.Contains(key, runtime.GOOS+"-") {
		t.Fatalf("PlatformKey 应包含 GOOS，实际 %q", key)
	}
	if strings.HasSuffix(key, "-arm") {
		t.Fatalf("32 位 arm 应映射为 armv7，实际 %q", key)
	}
}
