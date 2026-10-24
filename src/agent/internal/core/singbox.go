package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// SingBox 是 sing-box 内核的实现：
//   - 配置渲染、原子落盘、备份与回滚
//   - 通过 Clash API（experimental.clash_api）重载配置
//   - 通过 Clash API 采集流量统计
//   - 内核进程守护（崩溃自动拉起）
type SingBox struct {
	opts   Options
	log    *slog.Logger
	sup    *supervisor
	http   *http.Client
	cert   string
	config string
}

// NewSingBox 创建 sing-box 内核实现。
func NewSingBox(opts Options) (Core, error) {
	if opts.Binary == "" {
		return nil, errors.New("core: 未配置 core.binary")
	}
	if opts.ConfigPath == "" {
		return nil, errors.New("core: 未配置 core.config_path")
	}
	log := slog.Default()
	dir := opts.Dir
	if dir == "" {
		dir = filepath.Dir(opts.ConfigPath)
	}
	args := []string{"run", "-c", opts.ConfigPath}
	return &SingBox{
		opts:   opts,
		log:    log,
		sup:    newSupervisor(opts.Binary, args, dir, log, 5*time.Minute),
		http:   &http.Client{Timeout: 10 * time.Second},
		cert:   filepath.Join(dir, "certs"),
		config: opts.ConfigPath,
	}, nil
}

// SetLogger 注入日志器。
func (s *SingBox) SetLogger(log *slog.Logger) {
	if log != nil {
		s.log = log
		s.sup.log = log
	}
}

// Start 启动（并守护）内核进程。
func (s *SingBox) Start(ctx context.Context) error {
	return s.sup.Start(ctx)
}

// ApplyConfig 应用新的内核配置。
//
// 流程：渲染 → 写证书 → 备份旧配置 → 原子写入新配置 → 调用 Clash API 重载；
// 重载失败时回滚到旧配置并返回错误。
func (s *SingBox) ApplyConfig(ctx context.Context, bundle *Bundle) error {
	if bundle == nil {
		return errors.New("core: 配置为空")
	}
	if bundle.Config == nil {
		return errors.New("core: 配置内容为空")
	}
	if err := os.MkdirAll(filepath.Dir(s.config), 0o755); err != nil {
		return fmt.Errorf("core: 创建配置目录失败: %w", err)
	}
	if err := s.writeCertificates(bundle.Certificates); err != nil {
		return err
	}

	rendered, err := s.render(bundle)
	if err != nil {
		return err
	}
	if !json.Valid(rendered) {
		return errors.New("core: 渲染后的配置不是合法 JSON")
	}

	// 备份旧配置
	backup, hadOld, err := backupFile(s.config)
	if err != nil {
		return err
	}

	// 原子写入新配置
	if err := writeFileAtomic(s.config, rendered, 0o600); err != nil {
		return err
	}

	if !bundle.Reload {
		s.log.Info("配置已更新（无需重载内核）", "version", bundle.Version)
		return nil
	}

	if err := s.reload(ctx); err != nil {
		// 回滚旧配置
		if hadOld {
			if rerr := restoreFile(backup, s.config); rerr != nil {
				s.log.Error("回滚旧配置失败", "error", rerr.Error())
			}
		} else {
			_ = os.Remove(s.config)
		}
		return fmt.Errorf("core: 重载内核失败: %w", err)
	}
	s.log.Info("内核配置已应用", "version", bundle.Version)
	return nil
}

// render 渲染内核配置：注入本机参数（Clash API 监听地址等）。
func (s *SingBox) render(bundle *Bundle) ([]byte, error) {
	cfg := make(map[string]any, len(bundle.Config))
	for k, v := range bundle.Config {
		cfg[k] = v
	}
	if s.opts.ClashAPI != "" {
		cfg = injectClashAPI(cfg, s.opts.ClashAPI)
	}
	return json.MarshalIndent(cfg, "", "  ")
}

// injectClashAPI 注入本机的 Clash API 监听地址。
func injectClashAPI(cfg map[string]any, controller string) map[string]any {
	experimental, _ := cfg["experimental"].(map[string]any)
	if experimental == nil {
		experimental = map[string]any{}
	}
	clashAPI, _ := experimental["clash_api"].(map[string]any)
	if clashAPI == nil {
		clashAPI = map[string]any{}
	}
	clashAPI["external_controller"] = controller
	experimental["clash_api"] = clashAPI
	cfg["experimental"] = experimental
	return cfg
}

// writeCertificates 把证书写到本地目录。
func (s *SingBox) writeCertificates(certs []Certificate) error {
	if len(certs) == 0 {
		return nil
	}
	if err := os.MkdirAll(s.cert, 0o700); err != nil {
		return fmt.Errorf("core: 创建证书目录失败: %w", err)
	}
	for _, c := range certs {
		name := sanitizeName(c.Name)
		if name == "" {
			name = "cert"
		}
		content := c.Cert
		if !strings.Contains(content, "-----END") && c.Key != "" {
			content = c.Cert + "\n" + c.Key
		}
		if err := writeFileAtomic(filepath.Join(s.cert, name+".pem"), []byte(content), 0o600); err != nil {
			return err
		}
	}
	return nil
}

// reload 调用 Clash API 重载配置（PUT /configs）。
func (s *SingBox) reload(ctx context.Context) error {
	if s.opts.ClashAPI == "" {
		return errors.New("core: 未配置 clash_api 地址，无法热重载")
	}
	body, err := json.Marshal(map[string]string{"path": s.config})
	if err != nil {
		return err
	}
	url := strings.TrimRight(s.opts.ClashAPI, "/") + "/configs"
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("clash api 返回 %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	return nil
}

// Restart 重启内核进程。
func (s *SingBox) Restart(_ context.Context) error {
	s.sup.Restart()
	return nil
}

// Version 通过执行 `sing-box version` 获取版本号。
func (s *SingBox) Version(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, s.opts.Binary, "version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("core: 获取内核版本失败: %w", err)
	}
	return parseVersion(string(out)), nil
}

// Stats 通过 Clash API 采集流量统计。
func (s *SingBox) Stats(ctx context.Context) (Stats, error) {
	if s.opts.ClashAPI == "" {
		return Stats{}, errors.New("core: 未配置 clash_api 地址，无法采集流量")
	}
	out := Stats{Users: map[string]UserStat{}}

	traffic, err := s.getJSON(ctx, "/traffic")
	if err != nil {
		return out, err
	}
	if raw, ok := traffic["up"].(float64); ok {
		out.TotalUpload = uint64(raw)
	}
	if raw, ok := traffic["down"].(float64); ok {
		out.TotalDownload = uint64(raw)
	}

	conns, err := s.getJSON(ctx, "/connections")
	if err != nil {
		return out, err
	}
	list, _ := conns["connections"].([]any)
	users := map[string]bool{}
	for _, item := range list {
		conn, ok := item.(map[string]any)
		if !ok {
			continue
		}
		upload, _ := conn["upload"].(float64)
		download, _ := conn["download"].(float64)
		email := ""
		if meta, ok := conn["metadata"].(map[string]any); ok {
			if v, ok := meta["user"].(string); ok {
				email = v
			}
		}
		if email == "" {
			continue
		}
		users[email] = true
		st := out.Users[email]
		st.Upload += uint64(upload)
		st.Download += uint64(download)
		out.Users[email] = st
	}
	out.OnlineUsers = len(users)
	return out, nil
}

// getJSON 请求 Clash API 并解析 JSON。
func (s *SingBox) getJSON(ctx context.Context, path string) (map[string]any, error) {
	url := strings.TrimRight(s.opts.ClashAPI, "/") + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("core: 请求 clash api 失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("core: clash api 返回 %d", resp.StatusCode)
	}
	out := map[string]any{}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("core: 解析 clash api 响应失败: %w", err)
	}
	return out, nil
}

// Alive 返回内核进程是否存活。
func (s *SingBox) Alive() bool { return s.sup.Alive() }

// Close 停止内核进程。
func (s *SingBox) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	s.sup.Stop(ctx)
	return nil
}

// versionPattern 匹配版本号，例如 1.12.0。
var versionPattern = regexp.MustCompile(`\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.\-]+)?`)

// parseVersion 从 `sing-box version` 的输出里解析版本号。
func parseVersion(out string) string {
	if m := versionPattern.FindString(out); m != "" {
		return m
	}
	return strings.TrimSpace(out)
}

// sanitizeName 过滤文件名中的危险字符。
func sanitizeName(name string) string {
	var sb strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			sb.WriteRune(r)
		default:
			sb.WriteRune('_')
		}
	}
	return strings.Trim(sb.String(), ".")
}

// writeFileAtomic 原子写文件（先写临时文件再 rename）。
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("core: 创建目录失败: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("core: 创建临时文件失败: %w", err)
	}
	name := tmp.Name()
	defer func() {
		_ = os.Remove(name)
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("core: 写入临时文件失败: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("core: 同步临时文件失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("core: 关闭临时文件失败: %w", err)
	}
	if err := os.Chmod(name, perm); err != nil {
		return fmt.Errorf("core: 设置文件权限失败: %w", err)
	}
	if err := os.Rename(name, path); err != nil {
		return fmt.Errorf("core: 替换目标文件失败: %w", err)
	}
	return nil
}

// backupFile 备份文件，返回备份路径与「原先是否存在」。
func backupFile(path string) (string, bool, error) {
	backup := path + ".bak"
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return backup, false, nil
		}
		return "", false, fmt.Errorf("core: 读取旧配置失败: %w", err)
	}
	if err := writeFileAtomic(backup, data, 0o600); err != nil {
		return "", false, err
	}
	return backup, true, nil
}

// restoreFile 用备份覆盖目标文件。
func restoreFile(backup, target string) error {
	data, err := os.ReadFile(backup)
	if err != nil {
		return fmt.Errorf("core: 读取备份失败: %w", err)
	}
	return writeFileAtomic(target, data, 0o600)
}
