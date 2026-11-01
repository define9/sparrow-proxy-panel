package agent

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparrow/agent/internal/client"
	"sparrow/agent/internal/config"
	"sparrow/agent/internal/model"
	"sparrow/agent/internal/sign"
)

const (
	runnerSecret = "runner-test-secret"
	runnerNodeID = "11111111-aaaa-bbbb-cccc-222222222222"
)

/* ---------------- 假面板 ---------------- */

type ackRecord struct {
	ID     string
	Status string
	Result map[string]string
}

type fakePanel struct {
	mu sync.Mutex

	configVersion    int
	heartbeatCount   int
	configPolls      int
	notModifiedCount int
	trafficFailures  int
	acceptedTotal    int
	lastTrafficSeq   int64
	lastTrafficItems []model.TrafficItem
	commands         []model.Command
	acks             []ackRecord
}

func newFakePanel(t *testing.T, configVersion int) (*fakePanel, *httptest.Server) {
	t.Helper()
	p := &fakePanel{configVersion: configVersion}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/agent/heartbeat", p.auth(func(w http.ResponseWriter, r *http.Request, body []byte) {
		p.mu.Lock()
		p.heartbeatCount++
		version := p.configVersion
		p.mu.Unlock()
		writeFakeJSON(w, http.StatusOK, map[string]any{"ack": true, "configVersion": version, "minAgentVersion": "1.0.0"})
	}))
	mux.HandleFunc("/api/v1/agent/config", p.auth(func(w http.ResponseWriter, r *http.Request, body []byte) {
		p.mu.Lock()
		p.configPolls++
		version := p.configVersion
		p.mu.Unlock()

		current := strconv.Itoa(version)
		w.Header().Set("X-Config-Version", current)
		if r.Header.Get("X-Config-Version") == current {
			p.mu.Lock()
			p.notModifiedCount++
			p.mu.Unlock()
			w.WriteHeader(http.StatusNotModified)
			return
		}
		writeFakeJSON(w, http.StatusOK, map[string]any{
			"version": version,
			"core":    "sing-box",
			"config":  map[string]any{"log": map[string]any{"level": "info"}},
			"rules":   map[string]any{"users": []any{map[string]any{"email": "a@example.com", "uid": 1001}}},
			"reload":  true,
		})
	}))
	mux.HandleFunc("/api/v1/agent/traffic", p.auth(func(w http.ResponseWriter, r *http.Request, body []byte) {
		var report model.TrafficReport
		_ = json.Unmarshal(body, &report)

		p.mu.Lock()
		if p.trafficFailures > 0 {
			p.trafficFailures--
			p.mu.Unlock()
			writeFakeAPIError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "数据库暂时不可用")
			return
		}
		accepted := 0
		for _, item := range report.Items {
			if item.Upload > 0 || item.Download > 0 {
				accepted++
			}
		}
		p.acceptedTotal += accepted
		p.lastTrafficSeq = report.Seq
		p.lastTrafficItems = report.Items
		p.mu.Unlock()

		writeFakeJSON(w, http.StatusOK, map[string]any{"accepted": accepted, "seq": report.Seq})
	}))
	mux.HandleFunc("/api/v1/agent/commands", p.auth(func(w http.ResponseWriter, r *http.Request, body []byte) {
		p.mu.Lock()
		var batch []model.Command
		if len(p.commands) > 0 {
			batch = p.commands
			p.commands = nil
		}
		p.mu.Unlock()
		if batch == nil {
			batch = []model.Command{}
		}
		writeFakeJSON(w, http.StatusOK, map[string]any{"commands": batch})
	}))
	mux.HandleFunc("/api/v1/agent/commands/", p.auth(func(w http.ResponseWriter, r *http.Request, body []byte) {
		var ack model.CommandAck
		_ = json.Unmarshal(body, &ack)

		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/agent/commands/"), "/ack")
		record := ackRecord{ID: id, Status: ack.Status}
		if len(ack.Result) > 0 {
			_ = json.Unmarshal(ack.Result, &record.Result)
		}
		p.mu.Lock()
		p.acks = append(p.acks, record)
		p.mu.Unlock()
		writeFakeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return p, srv
}

// auth 是一个简化的验签中间件（共享实现，向量由 internal/sign 的测试保证）。
func (p *fakePanel) auth(h func(http.ResponseWriter, *http.Request, []byte)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		ts, err := strconv.ParseInt(r.Header.Get("X-Timestamp"), 10, 64)
		if err != nil || r.Header.Get("X-Node-Id") != runnerNodeID {
			writeFakeAPIError(w, http.StatusUnauthorized, "AGENT_SIGN_INVALID", "缺少签名请求头")
			return
		}
		headers := sign.Headers(r.Method, r.URL.Path, runnerSecret, string(body), time.UnixMilli(ts), r.Header.Get("X-Nonce"))
		if headers["X-Signature"] != r.Header.Get("X-Signature") {
			writeFakeAPIError(w, http.StatusUnauthorized, "AGENT_SIGN_INVALID", "签名校验失败")
			return
		}
		h(w, r, body)
	}
}

func (p *fakePanel) enqueue(commands ...model.Command) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.commands = append(p.commands, commands...)
}

func (p *fakePanel) heartbeats() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.heartbeatCount
}

func (p *fakePanel) notModified() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.notModifiedCount
}

func (p *fakePanel) ackList() []ackRecord {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]ackRecord(nil), p.acks...)
}

func (p *fakePanel) trafficSnapshot() (int, int64, []model.TrafficItem) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.acceptedTotal, p.lastTrafficSeq, append([]model.TrafficItem(nil), p.lastTrafficItems...)
}

func writeFakeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeFakeAPIError(w http.ResponseWriter, status int, code, message string) {
	writeFakeJSON(w, status, map[string]any{"statusCode": status, "code": code, "message": message})
}

/* ---------------- 假内核 ---------------- */

type fakeCore struct {
	mu        sync.Mutex
	applied   int
	payload   []byte
	stats     []model.UserStat
	statsErr  error
	alive     bool
	restarts  int
	stops     int
	version   string
	applyFail error
}

func newFakeCore() *fakeCore {
	return &fakeCore{alive: true, version: "1.12.0"}
}

func (f *fakeCore) Name() string { return "sing-box" }

func (f *fakeCore) Version(context.Context) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.version == "" {
		return "", io.EOF
	}
	return f.version, nil
}

func (f *fakeCore) Apply(_ context.Context, cfg []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.applyFail != nil {
		return f.applyFail
	}
	f.applied++
	f.payload = append([]byte(nil), cfg...)
	return nil
}

func (f *fakeCore) Restart(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.restarts++
	f.alive = true
	return nil
}

func (f *fakeCore) Stats(context.Context) ([]model.UserStat, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.statsErr != nil {
		return nil, f.statsErr
	}
	return append([]model.UserStat(nil), f.stats...), nil
}

func (f *fakeCore) OnlineUsers(context.Context) (int, error) { return 7, nil }

func (f *fakeCore) Alive(context.Context) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.alive
}

func (f *fakeCore) Stop(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stops++
	f.alive = false
	return nil
}

func (f *fakeCore) setStats(stats []model.UserStat) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stats = stats
}

func (f *fakeCore) appliedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.applied
}

func (f *fakeCore) stopCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.stops
}

/* ---------------- 测试脚手架 ---------------- */

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

func testConfig(panelURL, dataDir string) *config.Config {
	return &config.Config{
		Panel: config.Panel{URL: panelURL, NodeID: runnerNodeID, NodeSecret: runnerSecret},
		Core:  config.Core{Type: "sing-box", Binary: "/nonexistent/sing-box", ConfigPath: dataDir + "/core.json"},
		Agent: config.Agent{
			DataDir:            dataDir,
			HeartbeatInterval:  config.Duration(30 * time.Millisecond),
			ConfigPollInterval: config.Duration(40 * time.Millisecond),
			CommandPollTimeout: config.Duration(time.Second),
			MaxBackoff:         config.Duration(200 * time.Millisecond),
		},
	}
}

func newTestRunner(t *testing.T, panel *fakePanel, srv *httptest.Server, kernel *fakeCore, dir string) (*Runner, *config.Config) {
	t.Helper()
	log := testLogger()
	cfg := testConfig(srv.URL, dir)
	r, err := NewWithDeps(cfg, log, Deps{
		Client: client.New(srv.URL, runnerNodeID, runnerSecret, srv.Client()),
		Kernel: kernel,
		Store:  NewStore(dir, log),
	})
	if err != nil {
		t.Fatalf("构造 Runner 失败: %v", err)
	}
	return r, cfg
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("等待条件超时（%s）", timeout)
}

func loadState(t *testing.T, dir string) State {
	t.Helper()
	st, err := NewStore(dir, nil).Load()
	if err != nil {
		t.Fatalf("读取 state.json 失败: %v", err)
	}
	return st
}

/* ---------------- 用例 ---------------- */

// 心跳按间隔发送；配置只应用一次（第二次 304 不再 Apply）。
func TestRunHeartbeatsAndAppliesConfigOnce(t *testing.T) {
	panel, srv := newFakePanel(t, 2)
	kernel := newFakeCore()
	dir := t.TempDir()
	r, _ := newTestRunner(t, panel, srv, kernel, dir)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- r.Run(ctx) }()

	waitFor(t, 3*time.Second, func() bool {
		return panel.heartbeats() >= 3 && kernel.appliedCount() >= 1 && panel.notModified() >= 1
	})
	// 再多跑几个 tick，确保 304 分支不会重复 Apply。
	time.Sleep(120 * time.Millisecond)

	if got := kernel.appliedCount(); got != 1 {
		t.Fatalf("配置只应应用一次，实际 Apply 了 %d 次", got)
	}
	if got := r.currentConfigVersion(); got != 2 {
		t.Fatalf("内存 configVersion 期望 2，实际 %d", got)
	}

	cancel()
	if err := <-done; err != nil {
		t.Fatalf("Run 退出错误: %v", err)
	}

	st := loadState(t, dir)
	if st.ConfigVersion != 2 {
		t.Fatalf("state.json configVersion 期望 2，实际 %d", st.ConfigVersion)
	}
	if st.CoreVersion != "1.12.0" {
		t.Fatalf("state.json coreVersion 期望 1.12.0，实际 %q", st.CoreVersion)
	}
	if kernel.stopCount() == 0 {
		t.Fatal("退出时应停止内核")
	}
}

// 流量上报失败进 backlog 并落盘；恢复后合并重发，accepted 与总量对得上。
func TestTrafficBacklogMergedAndResent(t *testing.T) {
	panel, srv := newFakePanel(t, 1)
	panel.trafficFailures = 2
	kernel := newFakeCore()
	kernel.setStats([]model.UserStat{{UID: 1001, Upload: 100, Download: 200}})
	dir := t.TempDir()
	r, _ := newTestRunner(t, panel, srv, kernel, dir)
	ctx := context.Background()

	// 第 1 次：面板 500 → 增量进 backlog 并落盘。
	if err := r.flushTraffic(ctx); err == nil {
		t.Fatal("第 1 次上报期望失败")
	}
	st := loadState(t, dir)
	if st.Seq != 1 {
		t.Fatalf("seq 期望 1，实际 %d", st.Seq)
	}
	if len(st.Backlog) != 1 || st.Backlog[0] != (model.TrafficItem{UID: 1001, Upload: 100, Download: 200}) {
		t.Fatalf("backlog 期望 1001/100/200，实际 %+v", st.Backlog)
	}

	// 第 2 次：内核累计增长 → 新增量与 backlog 合并，仍然失败。
	kernel.setStats([]model.UserStat{{UID: 1001, Upload: 300, Download: 500}})
	if err := r.flushTraffic(ctx); err == nil {
		t.Fatal("第 2 次上报期望失败")
	}
	st = loadState(t, dir)
	if st.Seq != 2 {
		t.Fatalf("seq 期望 2，实际 %d", st.Seq)
	}
	if len(st.Backlog) != 1 || st.Backlog[0] != (model.TrafficItem{UID: 1001, Upload: 300, Download: 500}) {
		t.Fatalf("合并后 backlog 期望 300/500，实际 %+v", st.Backlog)
	}

	// 第 3 次：面板恢复 → 一次性补报全部，accepted=1 且总量 400/600。
	kernel.setStats([]model.UserStat{{UID: 1001, Upload: 400, Download: 600}})
	if err := r.flushTraffic(ctx); err != nil {
		t.Fatalf("恢复后上报应成功: %v", err)
	}
	st = loadState(t, dir)
	if st.Seq != 3 {
		t.Fatalf("seq 期望 3，实际 %d", st.Seq)
	}
	if len(st.Backlog) != 0 {
		t.Fatalf("成功后 backlog 应清空，实际 %+v", st.Backlog)
	}

	accepted, seq, items := panel.trafficSnapshot()
	if accepted != 1 {
		t.Fatalf("accepted 期望 1（同 uid 已合并），实际 %d", accepted)
	}
	if seq != 3 {
		t.Fatalf("面板收到的 seq 期望 3，实际 %d", seq)
	}
	if len(items) != 1 || items[0].Upload != 400 || items[0].Download != 600 {
		t.Fatalf("重发总量期望 400/600，实际 %+v", items)
	}
}

// 命令长轮询收到 reload_config → 回执 success 并重新应用配置。
func TestCommandReloadConfigAcked(t *testing.T) {
	panel, srv := newFakePanel(t, 1)
	panel.enqueue(model.Command{ID: "cmd-1", Command: "reload_config"})
	kernel := newFakeCore()
	dir := t.TempDir()
	r, _ := newTestRunner(t, panel, srv, kernel, dir)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go r.commandLoop(ctx)

	waitFor(t, 3*time.Second, func() bool { return len(panel.ackList()) >= 1 })

	acks := panel.ackList()
	if acks[0].ID != "cmd-1" || acks[0].Status != "success" {
		t.Fatalf("期望 cmd-1 success，实际 %+v", acks[0])
	}
	if kernel.appliedCount() != 1 {
		t.Fatalf("reload_config 应重新应用配置，实际 Apply %d 次", kernel.appliedCount())
	}
	if r.currentConfigVersion() != 1 {
		t.Fatalf("configVersion 期望 1，实际 %d", r.currentConfigVersion())
	}
}

// upgrade_core / update_agent 未实现时必须回执 failed + 明确原因。
func TestUnimplementedCommandsAckFailed(t *testing.T) {
	panel, srv := newFakePanel(t, 1)
	kernel := newFakeCore()
	dir := t.TempDir()
	r, _ := newTestRunner(t, panel, srv, kernel, dir)
	ctx := context.Background()

	panel.enqueue(
		model.Command{ID: "cmd-core", Command: "upgrade_core"},
		model.Command{ID: "cmd-agent", Command: "update_agent"},
	)
	if err := r.commandTick(ctx); err != nil {
		t.Fatalf("命令处理不应返回错误: %v", err)
	}

	acks := panel.ackList()
	if len(acks) != 2 {
		t.Fatalf("期望 2 条回执，实际 %+v", acks)
	}
	if acks[0].ID != "cmd-core" || acks[0].Status != "failed" {
		t.Fatalf("upgrade_core 期望 failed，实际 %+v", acks[0])
	}
	if !strings.Contains(acks[0].Result["error"], "未实现") {
		t.Fatalf("upgrade_core 原因应说明未实现，实际 %+v", acks[0].Result)
	}
	if acks[1].ID != "cmd-agent" || acks[1].Status != "failed" {
		t.Fatalf("update_agent 期望 failed，实际 %+v", acks[1])
	}
	if acks[1].Result["error"] == "" {
		t.Fatalf("update_agent 应带失败原因，实际 %+v", acks[1].Result)
	}
}

// 重启后 seq / configVersion / coreVersion 从 state.json 恢复，
// 且首次拉配置带持久化版本（命中 304，不再 Apply）。
func TestStateSurvivesRestart(t *testing.T) {
	panel, srv := newFakePanel(t, 5)
	dir := t.TempDir()

	firstKernel := newFakeCore()
	firstKernel.setStats([]model.UserStat{{UID: 1001, Upload: 10, Download: 20}})
	r1, _ := newTestRunner(t, panel, srv, firstKernel, dir)
	ctx := context.Background()

	if err := r1.pullConfig(ctx); err != nil {
		t.Fatalf("首次拉配置失败: %v", err)
	}
	r1.setCoreVersion("1.12.0")
	if err := r1.flushTraffic(ctx); err != nil {
		t.Fatalf("首次上报失败: %v", err)
	}

	// 模拟进程重启：新的 Runner / 新内核，同一 data_dir。
	secondKernel := newFakeCore()
	r2, _ := newTestRunner(t, panel, srv, secondKernel, dir)
	if r2.currentSeq() != 1 {
		t.Fatalf("重启后 seq 期望 1，实际 %d", r2.currentSeq())
	}
	if r2.currentConfigVersion() != 5 {
		t.Fatalf("重启后 configVersion 期望 5，实际 %d", r2.currentConfigVersion())
	}
	if r2.currentCoreVersion() != "1.12.0" {
		t.Fatalf("重启后 coreVersion 期望 1.12.0，实际 %q", r2.currentCoreVersion())
	}

	before := panel.notModified()
	if err := r2.pullConfig(ctx); err != nil {
		t.Fatalf("重启后拉配置失败: %v", err)
	}
	if panel.notModified() != before+1 {
		t.Fatal("重启后首次拉配置应带持久化版本号并命中 304")
	}
	if secondKernel.appliedCount() != 0 {
		t.Fatalf("304 不应重复 Apply，实际 %d 次", secondKernel.appliedCount())
	}

	// 恢复的 seq 继续单调递增（新进程重新从内核累计值做差，首次是全量）。
	secondKernel.setStats([]model.UserStat{{UID: 1001, Upload: 15, Download: 25}})
	if err := r2.flushTraffic(ctx); err != nil {
		t.Fatalf("重启后上报失败: %v", err)
	}
	if got := loadState(t, dir).Seq; got != 2 {
		t.Fatalf("重启后 seq 期望 2，实际 %d", got)
	}
}

// 单个循环失败时按退避重试，成功一次后重置（不再等下一个 tick）。
func TestLoopBackoffResetsAfterSuccess(t *testing.T) {
	panel, srv := newFakePanel(t, 1)
	panel.trafficFailures = 1
	kernel := newFakeCore()
	kernel.setStats([]model.UserStat{{UID: 1001, Upload: 10, Download: 20}})
	dir := t.TempDir()
	r, _ := newTestRunner(t, panel, srv, kernel, dir)

	// 间隔很长（2s），但失败后应在 ~1s 内退避重试而不是等到下个 tick。
	r.cfg.Agent.HeartbeatInterval = config.Duration(2 * time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)

	start := time.Now()
	done := make(chan struct{})
	go func() {
		defer close(done)
		r.trafficLoop(ctx)
	}()
	waitFor(t, 2500*time.Millisecond, func() bool { return r.currentSeq() >= 2 })
	if elapsed := time.Since(start); elapsed > 1900*time.Millisecond {
		t.Fatalf("失败后应内部退避重试（1s），实际耗时 %v", elapsed)
	}
	// 等循环真正退出，避免后台 goroutine 在 TempDir 清理后继续写 state.json。
	cancel()
	<-done
}

// status 子命令数据来源：state.json + 进程探测，不连面板。
func TestLocalStatusReadsStateAndProcess(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, nil)
	if err := store.Save(State{
		Seq:           9,
		ConfigVersion: 4,
		CoreVersion:   "1.12.0",
		Backlog:       []model.TrafficItem{{UID: 1001, Upload: 1, Download: 2}},
	}); err != nil {
		t.Fatal(err)
	}

	original := pgrepFn
	pgrepFn = func(pattern string) bool { return pattern == "sing-box" }
	defer func() { pgrepFn = original }()

	cfg := &config.Config{
		Panel: config.Panel{URL: "http://127.0.0.1:1", NodeID: "node-1", NodeSecret: "secret"},
		Core:  config.Core{Type: "sing-box", Binary: "/opt/sing-box"},
		Agent: config.Agent{DataDir: dir},
	}
	out := LocalStatus(cfg)

	if out["trafficSeq"] != int64(9) {
		t.Fatalf("trafficSeq 期望 9，实际 %v", out["trafficSeq"])
	}
	if out["configVersion"] != int64(4) {
		t.Fatalf("configVersion 期望 4，实际 %v", out["configVersion"])
	}
	if out["coreVersion"] != "1.12.0" {
		t.Fatalf("coreVersion 期望 1.12.0，实际 %v", out["coreVersion"])
	}
	if out["backlog"] != 1 {
		t.Fatalf("backlog 期望 1，实际 %v", out["backlog"])
	}
	if out["coreAlive"] != true {
		t.Fatalf("coreAlive 期望 true，实际 %v", out["coreAlive"])
	}
	if out["registered"] != true {
		t.Fatalf("registered 期望 true，实际 %v", out["registered"])
	}
	if _, ok := out["stateError"]; ok {
		t.Fatalf("正常 state.json 不应有 stateError: %v", out["stateError"])
	}
}

func TestDetectCoreAliveEmptyBinary(t *testing.T) {
	if DetectCoreAlive("") {
		t.Fatal("空 binary 应判定为不在运行")
	}
}
