package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"sparrow/agent/internal/model"
)

// sing-box 的统计来自 Clash API（experimental.clash_api）。
//
// 主路径：GET /connections，把每条连接按 metadata.user / metadata.email 归并到 uid；
// 兜底：/connections 不含用户信息时退回 GET /traffic（全局速率），按最近一次已知的用户占比分摊。
const (
	defaultClashController = "127.0.0.1:9090"
	statsHTTPTimeout       = 3 * time.Second
)

type singBox struct {
	*processCore
	dir    *directory
	client *http.Client
	log    *slog.Logger

	mu         sync.Mutex
	controller string // 来自 experimental.clash_api.external_controller
	secret     string // 来自 experimental.clash_api.secret（可选）
	acc        map[int]uidTotals
	baseline   map[int]uidTotals // 上一次 /connections 里各 uid 的 live 值，用于把「连接关闭导致计数消失」抹平
	share      map[int]float64   // 最近一次 /connections 里的用户流量占比，供 /traffic 兜底分摊
	lastSample time.Time
	warnedOnce bool
}

func newSingBox(opts Options) *singBox {
	return &singBox{
		processCore: newProcessCore("sing-box", opts),
		dir:         newDirectory(),
		client:      &http.Client{Timeout: statsHTTPTimeout},
		log:         loggerOr(opts.Logger),
		controller:  defaultClashController,
		acc:         map[int]uidTotals{},
		baseline:    map[int]uidTotals{},
		share:       map[int]float64{},
	}
}

// SetUsers 接收面板 rules.users 的 email → uid 映射（权威来源）。
func (s *singBox) SetUsers(users []model.ConfigUser) {
	s.dir.setDeclared(users)
}

// Apply 先做本地参数注入（确保 experimental.clash_api 存在），再走通用流程。
func (s *singBox) Apply(ctx context.Context, config []byte) error {
	injected, users, controller, secret, err := injectSingBoxConfig(config)
	if err != nil {
		return err
	}

	s.dir.setFromCore(users)
	s.mu.Lock()
	s.controller = controller
	s.secret = secret
	s.mu.Unlock()

	if err := s.processCore.Apply(ctx, injected); err != nil {
		return err
	}

	// 内核已重启，累计计数器归零，清空本地基线（与 traffic.Collector.Reset 对齐）。
	s.mu.Lock()
	s.acc = map[int]uidTotals{}
	s.baseline = map[int]uidTotals{}
	s.share = map[int]float64{}
	s.lastSample = time.Time{}
	s.mu.Unlock()
	return nil
}

// injectSingBoxConfig 保证 experimental.clash_api 存在；已有配置一律保留。
func injectSingBoxConfig(config []byte) (injected []byte, users map[string]int, controller, secret string, err error) {
	root, err := decodeJSONObject(config)
	if err != nil {
		return nil, nil, "", "", err
	}

	experimental := ensureObject(root, "experimental")
	clashAPI := ensureObject(experimental, "clash_api")
	setDefault(clashAPI, "external_controller", defaultClashController)

	controller = defaultClashController
	if value, ok := clashAPI["external_controller"].(string); ok && strings.TrimSpace(value) != "" {
		controller = strings.TrimSpace(value)
	}
	if value, ok := clashAPI["secret"].(string); ok {
		secret = value
	}

	out, err := encodeJSONObject(root)
	if err != nil {
		return nil, nil, "", "", err
	}
	return out, collectEmailUIDs(root), controller, secret, nil
}

/* ---------------- 统计 ---------------- */

type clashConnection struct {
	ID       string `json:"id"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Metadata struct {
		User          string `json:"user"`
		Email         string `json:"email"`
		Network       string `json:"network"`
		SourceIP      string `json:"sourceIP"`
		DestinationIP string `json:"destinationIP"`
	} `json:"metadata"`
}

type clashConnections struct {
	UploadTotal   int64             `json:"uploadTotal"`
	DownloadTotal int64             `json:"downloadTotal"`
	Connections   []clashConnection `json:"connections"`
}

type clashTraffic struct {
	Up   int64 `json:"up"`
	Down int64 `json:"down"`
}

// Stats 返回按 uid 的累计流量（不是增量）。
func (s *singBox) Stats(ctx context.Context) ([]model.UserStat, error) {
	base, secret := s.endpoint()

	connections, err := s.fetchConnections(ctx, base, secret)
	if err != nil {
		return nil, err
	}

	live := make(map[int]uidTotals, len(connections.Connections))
	labelled := 0
	for _, conn := range connections.Connections {
		email := connectionUser(conn)
		if email == "" {
			continue
		}
		uid, ok := s.dir.uid(email)
		if !ok {
			// 匹配不上 rules.users 的连接归入 uid=0 后丢弃。
			continue
		}
		totals := live[uid]
		totals.upload += conn.Upload
		totals.download += conn.Download
		live[uid] = totals
		labelled++
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if labelled == 0 && len(connections.Connections) > 0 {
		return s.fallbackTrafficLocked(ctx, base, secret)
	}

	s.applyLiveLocked(live)
	return sortedStats(s.acc), nil
}

// OnlineUsers 返回 /connections 里去重后的用户数。
func (s *singBox) OnlineUsers(ctx context.Context) (int, error) {
	base, secret := s.endpoint()
	connections, err := s.fetchConnections(ctx, base, secret)
	if err != nil {
		return 0, err
	}

	seen := make(map[string]struct{}, len(connections.Connections))
	for _, conn := range connections.Connections {
		if user := connectionUser(conn); user != "" {
			seen[user] = struct{}{}
		}
	}
	if len(seen) == 0 {
		// 内核没给用户标签时，退回连接数。
		return len(connections.Connections), nil
	}
	return len(seen), nil
}

// applyLiveLocked 把本次 /connections 的 live 值并入单调累计值。
//
// Clash API 只列出「还活着」的连接，连接关闭后它的计数会消失。若直接返回 live 求和，
// 累计值会倒退，traffic.Collector 会把它当成「内核重启」重复计入。这里按 uid 记录
// 上次的 live 值，只累加增量（增量为负说明连接关闭，忽略）。
func (s *singBox) applyLiveLocked(live map[int]uidTotals) {
	var total int64
	for uid, current := range live {
		acc := s.acc[uid]
		if previous, seen := s.baseline[uid]; seen {
			if delta := current.upload - previous.upload; delta > 0 {
				acc.upload += delta
			}
			if delta := current.download - previous.download; delta > 0 {
				acc.download += delta
			}
		} else {
			acc.upload += current.upload
			acc.download += current.download
		}
		s.acc[uid] = acc
		total += current.total()
	}

	s.baseline = live

	if total > 0 {
		share := make(map[int]float64, len(live))
		for uid, current := range live {
			share[uid] = float64(current.total()) / float64(total)
		}
		s.share = share
	}
}

// fallbackTrafficLocked 在 /connections 不含用户信息时，用 /traffic 的全局速率按占比分摊。
// 调用方必须持有 s.mu。
func (s *singBox) fallbackTrafficLocked(ctx context.Context, base, secret string) ([]model.UserStat, error) {
	var sample clashTraffic
	if err := s.getJSON(ctx, base, secret, "/traffic", &sample); err != nil {
		return nil, err
	}

	if !s.warnedOnce {
		s.warnedOnce = true
		s.log.Warn("Clash API /connections 不含用户信息，退回 /traffic 按用户占比分摊，精度受限",
			"controller", base)
	}

	if len(s.share) == 0 {
		// 还没有任何一次带用户信息的 /connections，无法归因，返回已有累计值。
		return sortedStats(s.acc), nil
	}

	// /traffic 是「上一秒的速率」，按两次采样的间隔折算成流量（上限 5 分钟，避免休眠后爆量）。
	now := time.Now()
	elapsed := 1.0
	if !s.lastSample.IsZero() {
		elapsed = now.Sub(s.lastSample).Seconds()
		if elapsed < 0.1 {
			elapsed = 0.1
		}
		if elapsed > 300 {
			elapsed = 300
		}
	}
	s.lastSample = now

	upload := int64(float64(sample.Up) * elapsed)
	download := int64(float64(sample.Down) * elapsed)
	for uid, share := range s.share {
		acc := s.acc[uid]
		acc.upload += int64(float64(upload) * share)
		acc.download += int64(float64(download) * share)
		s.acc[uid] = acc
	}

	return sortedStats(s.acc), nil
}

/* ---------------- HTTP ---------------- */

func (s *singBox) fetchConnections(ctx context.Context, base, secret string) (*clashConnections, error) {
	var out clashConnections
	if err := s.getJSON(ctx, base, secret, "/connections", &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *singBox) getJSON(ctx context.Context, base, secret, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return fmt.Errorf("构造请求 %s 失败: %w", path, err)
	}
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("请求 Clash API %s 失败: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("读取 Clash API %s 响应失败: %w", path, err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Clash API %s 返回 HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("解析 Clash API %s 响应失败: %w", path, err)
	}
	return nil
}

// endpoint 返回 Clash API 的 base URL 与 auth secret。
func (s *singBox) endpoint() (string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return clashBaseURL(s.controller), s.secret
}

// clashBaseURL 把 external_controller（host:port 或带 scheme）规范成 base URL。
func clashBaseURL(controller string) string {
	controller = strings.TrimSpace(controller)
	if controller == "" {
		controller = defaultClashController
	}
	// 监听 0.0.0.0 / [::] 时本机应连回环地址。
	if strings.HasPrefix(controller, "0.0.0.0:") {
		controller = "127.0.0.1:" + strings.TrimPrefix(controller, "0.0.0.0:")
	} else if strings.HasPrefix(controller, "[::]:") {
		controller = "127.0.0.1:" + strings.TrimPrefix(controller, "[::]:")
	}
	if !strings.HasPrefix(controller, "http://") && !strings.HasPrefix(controller, "https://") {
		controller = "http://" + controller
	}
	return strings.TrimRight(controller, "/")
}

// connectionUser 取连接所属用户；sing-box 里字段名可能是 metadata.user 或 metadata.email。
func connectionUser(conn clashConnection) string {
	if user := strings.TrimSpace(conn.Metadata.User); user != "" {
		return user
	}
	return strings.TrimSpace(conn.Metadata.Email)
}
