package cache

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sparrow/agent/internal/model"
)

const sampleConfig = `{"log":{"level":"info"},"inbounds":[],"experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}}}`

func TestSaveAndLoadConfig(t *testing.T) {
	dir := t.TempDir()
	c := New(dir)

	if err := c.SaveConfig(3, "sing-box", []byte(sampleConfig)); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	version, core, raw, err := c.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if version != 3 || core != "sing-box" {
		t.Fatalf("读回的元信息不符: version=%d core=%q", version, core)
	}
	if strings.TrimSpace(string(raw)) != sampleConfig {
		t.Fatalf("读回的配置不一致:\n%s", raw)
	}

	info, err := os.Stat(filepath.Join(dir, ConfigFile))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("配置文件权限应为 0600，实际 %o", perm)
	}
	assertNoTempFiles(t, dir)
}

func TestSaveConfigOverwrites(t *testing.T) {
	dir := t.TempDir()
	c := New(dir)

	if err := c.SaveConfig(1, "sing-box", []byte(sampleConfig)); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	next := `{"log":{"level":"debug"}}`
	if err := c.SaveConfig(2, "sing-box", []byte(next)); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	version, _, raw, err := c.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if version != 2 || strings.TrimSpace(string(raw)) != next {
		t.Fatalf("覆盖写入失败: version=%d config=%s", version, raw)
	}
	assertNoTempFiles(t, dir)
}

func TestLoadConfigMissing(t *testing.T) {
	c := New(t.TempDir())
	_, _, _, err := c.LoadConfig()
	if err == nil {
		t.Fatal("没有缓存时应返回错误")
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("错误应可被 errors.Is(err, os.ErrNotExist) 识别: %v", err)
	}
}

func TestSaveConfigRejectsBadInput(t *testing.T) {
	c := New(t.TempDir())
	if err := c.SaveConfig(1, "sing-box", []byte("not json")); err == nil {
		t.Fatal("非法 JSON 应被拒绝")
	}
	if err := c.SaveConfig(1, "sing-box", nil); err == nil {
		t.Fatal("空配置应被拒绝")
	}
	if err := New("").SaveConfig(1, "sing-box", []byte(sampleConfig)); err == nil {
		t.Fatal("未配置目录应被拒绝")
	}
}

func TestSaveCertificates(t *testing.T) {
	dir := t.TempDir()
	c := New(dir)

	certs := []model.Certificate{
		{Name: "node-1", Cert: "-----BEGIN CERTIFICATE-----\nAAA", Key: "-----BEGIN PRIVATE KEY-----\nBBB"},
	}
	if err := c.SaveCertificates(certs); err != nil {
		t.Fatalf("SaveCertificates: %v", err)
	}

	for _, file := range []string{"node-1.pem", "node-1.key"} {
		path := filepath.Join(dir, certsDir, file)
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", file, err)
		}
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Fatalf("%s 权限应为 0600，实际 %o", file, perm)
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		if !strings.HasSuffix(string(raw), "\n") {
			t.Fatalf("%s 应以换行结尾", file)
		}
	}

	assertNoTempFiles(t, dir)
	assertNoTempFiles(t, filepath.Join(dir, certsDir))
}

func TestSaveCertificatesRejectsTraversal(t *testing.T) {
	c := New(t.TempDir())
	for _, name := range []string{"", "..", "../escape", "a/b"} {
		if err := c.SaveCertificates([]model.Certificate{{Name: name, Cert: "x"}}); err == nil {
			t.Fatalf("非法证书名 %q 应被拒绝", name)
		}
	}
}

func assertNoTempFiles(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir %s: %v", dir, err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".tmp-") || strings.HasSuffix(entry.Name(), ".tmp") {
			t.Fatalf("目录 %s 残留临时文件 %s", dir, entry.Name())
		}
	}
}
