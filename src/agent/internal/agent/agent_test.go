package agent

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sparrows/sparrow-agent/internal/cache"
	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/config"
	"github.com/sparrows/sparrow-agent/internal/core"
	"github.com/sparrows/sparrow-agent/internal/metrics"
)

// testConfig 构造一份用于测试的配置（间隔很短）。
func testConfig(t *testing.T, panelURL, nodeID, secret string) *config.Config {
	t.Helper()
	cfg := config.Default()
	cfg.Panel.URL = panelURL
	cfg.Panel.NodeID = nodeID
	cfg.Panel.NodeSecret = secret
	cfg.Core.Type = "fake"
	cfg.Agent.DataDir = t.TempDir()
	cfg.Agent.HeartbeatInterval = config.Duration(50 * time.Millisecond)
	cfg.Agent.ConfigPollInterval = config.Duration(100 * time.Millisecond)
	cfg.Agent.TrafficReportPeriod = config.Duration(50 * time.Millisecond)
	cfg.Agent.CommandPollTimeout = config.Duration(200 * time.Millisecond)
	cfg.Agent.MaxBackoff = config.Duration(2 * time.Second)
	cfg.Agent.MetricsAddr = ""
	return cfg
}

// testLogger 返回一个丢弃输出的日志器（避免测试输出噪音）。
func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(discard{}, &slog.HandlerOptions{Level: slog.LevelError}))
}

// discard 是一个丢弃所有写入的 io.Writer。
type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// TestAgentFullFlow 跑通完整流程：注册 → 心跳 → 拉配置 → 上报流量 → 收到命令并 ack。
func TestAgentFullFlow(t *testing.T) {
	panel := newFakePanel(t)
	panel.setConfig(42, []client.ConfigUserRule{{
		Email:         "u_1001",
		Uid:           1001,
		Limit:         10737418240,
		DownloadSpeed: 0,
		UploadSpeed:   0,
		DeviceLimit:   0,
		Enabled:       true,
	}})
	panel.setCommands([]client.AgentCommand{{
		Id:       mustUUID("11111111-2222-4333-8444-555555555555"),
		Command:  client.RestartCore,
		Payload:  map[string]any{},
		IssuedAt: time.Now().UTC(),
	}})

	// 1) 注册
	api, err := client.New(client.Options{BaseURL: panel.URL(), NodeID: panel.nodeID, Secret: panel.secret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	regResp, err := api.Register(context.Background(), panel.registrationToken, client.AgentRegisterRequest{
		Hostname:     "test-node",
		AgentVersion: "1.0.0",
		Os:           "linux",
		Arch:         "amd64",
	})
	if err != nil {
		t.Fatalf("注册失败: %v", err)
	}
	if regResp.NodeSecret != panel.secret {
		t.Fatalf("注册返回的密钥不匹配: %s", regResp.NodeSecret)
	}

	// 2) 启动 Agent
	cfg := testConfig(t, panel.URL(), regResp.NodeId.String(), regResp.NodeSecret)
	fakeCore := core.NewFake(core.Options{})
	fakeCore.SetStats(core.Stats{
		Users:         map[string]core.UserStat{"u_1001": {Upload: 1000, Download: 2000}},
		TotalUpload:   1000,
		TotalDownload: 2000,
	})

	ag, err := New(Options{
		Config:  cfg,
		Client:  api,
		Core:    fakeCore,
		Logger:  testLogger(),
		Metrics: metrics.New(),
		Cache:   cache.New(cfg.CacheFile()),
	})
	if err != nil {
		t.Fatalf("创建 Agent 失败: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- ag.Run(ctx) }()

	// 3) 等待心跳
	waitFor(t, 5*time.Second, "收到心跳", func() bool { return panel.heartbeatCount() >= 1 })

	// 4) 等待配置下发并被应用（内核收到配置 + 本地缓存落盘）
	waitFor(t, 5*time.Second, "内核收到配置", func() bool { return len(fakeCore.Bundles()) >= 1 })
	entry, err := cache.New(cfg.CacheFile()).Load()
	if err != nil || entry == nil {
		t.Fatalf("本地配置缓存未落盘: %v", err)
	}
	if entry.Version != 42 {
		t.Fatalf("缓存配置版本不对: %d", entry.Version)
	}

	// 5) 等待流量上报（只上报增量，uid 与字节数必须正确）
	waitFor(t, 5*time.Second, "收到流量上报", func() bool { return len(panel.trafficReports()) >= 1 })
	reports := panel.trafficReports()
	first := reports[0]
	if first.Seq < 1 {
		t.Fatalf("流量 seq 必须从 1 开始: %d", first.Seq)
	}
	if len(first.Items) != 1 {
		t.Fatalf("流量条目数不对: %d", len(first.Items))
	}
	item := first.Items[0]
	if item.Uid != 1001 {
		t.Fatalf("流量 uid 不对: %d", item.Uid)
	}
	if item.Upload != 1000 || item.Download != 2000 {
		t.Fatalf("流量字节数不对: upload=%d download=%d", item.Upload, item.Download)
	}
	// seq 必须单调递增
	for i := 1; i < len(reports); i++ {
		if reports[i].Seq <= reports[i-1].Seq {
			t.Fatalf("流量 seq 必须单调递增: %d -> %d", reports[i-1].Seq, reports[i].Seq)
		}
	}

	// 6) 等待命令被执行并回执
	waitFor(t, 5*time.Second, "收到命令回执", func() bool { return len(panel.commandAcks()) >= 1 })
	acks := panel.commandAcks()
	if acks[0].Status != client.CommandAckStatusSuccess {
		t.Fatalf("命令回执状态应为成功，实际 %s", acks[0].Status)
	}
	if fakeCore.Restarts() != 1 {
		t.Fatalf("内核应被重启 1 次，实际 %d", fakeCore.Restarts())
	}

	// 7) 优雅退出
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Agent 退出返回错误: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Agent 未能在超时内退出")
	}
}

// TestAgentTrafficBufferAndRecovery 校验：上报失败时增量进入本地缓冲，恢复后补报。
func TestAgentTrafficBufferAndRecovery(t *testing.T) {
	panel := newFakePanel(t)
	panel.setConfig(7, []client.ConfigUserRule{{Email: "u_1001", Uid: 1001, Enabled: true}})
	panel.setTrafficFail(true)

	cfg := testConfig(t, panel.URL(), panel.nodeID, panel.secret)
	fakeCore := core.NewFake(core.Options{})
	fakeCore.SetStats(core.Stats{
		Users:         map[string]core.UserStat{"u_1001": {Upload: 100, Download: 200}},
		TotalUpload:   100,
		TotalDownload: 200,
	})

	api, err := client.New(client.Options{BaseURL: panel.URL(), NodeID: panel.nodeID, Secret: panel.secret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	ag, err := New(Options{
		Config:  cfg,
		Client:  api,
		Core:    fakeCore,
		Logger:  testLogger(),
		Metrics: metrics.New(),
		Cache:   cache.New(cfg.CacheFile()),
	})
	if err != nil {
		t.Fatalf("创建 Agent 失败: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- ag.Run(ctx) }()

	// 面板不可用时，增量应堆积在本地缓冲里
	waitFor(t, 5*time.Second, "流量进入本地缓冲", func() bool {
		raw, err := os.ReadFile(cfg.TrafficOutboxFile())
		return err == nil && len(raw) > 0
	})

	// 面板恢复后应补报
	panel.setTrafficFail(false)
	waitFor(t, 10*time.Second, "补报成功的流量", func() bool { return len(panel.trafficReports()) >= 1 })

	reports := panel.trafficReports()
	if reports[0].Seq != 1 {
		t.Fatalf("补报的 seq 应从 1 开始: %d", reports[0].Seq)
	}
	if reports[0].Items[0].Upload != 100 || reports[0].Items[0].Download != 200 {
		t.Fatalf("补报字节数不对: %+v", reports[0].Items[0])
	}

	cancel()
	<-done
}

// TestAgentOfflineTolerance 校验：面板不可达时使用本地缓存的配置继续服务。
func TestAgentOfflineTolerance(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Default()
	cfg.Panel.URL = "http://127.0.0.1:1" // 一定连不上的地址
	cfg.Panel.NodeID = "9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"
	cfg.Panel.NodeSecret = "unit-test-key-01"
	cfg.Core.Type = "fake"
	cfg.Agent.DataDir = dir
	cfg.Agent.HeartbeatInterval = config.Duration(50 * time.Millisecond)
	cfg.Agent.ConfigPollInterval = config.Duration(100 * time.Millisecond)
	cfg.Agent.TrafficReportPeriod = config.Duration(50 * time.Millisecond)
	cfg.Agent.CommandPollTimeout = config.Duration(100 * time.Millisecond)
	cfg.Agent.MaxBackoff = config.Duration(time.Second)
	cfg.Agent.MetricsAddr = ""

	// 预置本地缓存（模拟上一次成功同步的配置）
	cacheFile := filepath.Join(dir, "config-cache.json")
	c := cache.New(cacheFile)
	if err := c.Save(&core.Bundle{
		Version: 99,
		Core:    "sing-box",
		Config:  map[string]any{"inbounds": []any{map[string]any{"tag": "cached"}}},
		Rules:   []core.UserRule{{Email: "u_1001", Uid: 1001, Enabled: true}},
		Reload:  true,
	}); err != nil {
		t.Fatalf("写入缓存失败: %v", err)
	}

	fakeCore := core.NewFake(core.Options{})
	api, err := client.New(client.Options{BaseURL: cfg.Panel.URL, NodeID: cfg.Panel.NodeID, Secret: cfg.Panel.NodeSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	ag, err := New(Options{
		Config:  cfg,
		Client:  api,
		Core:    fakeCore,
		Logger:  testLogger(),
		Metrics: metrics.New(),
		Cache:   cache.New(cacheFile),
	})
	if err != nil {
		t.Fatalf("创建 Agent 失败: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- ag.Run(ctx) }()

	// 面板不可达，但缓存配置仍被应用
	waitFor(t, 5*time.Second, "应用本地缓存配置", func() bool { return len(fakeCore.Bundles()) >= 1 })
	bundle := fakeCore.Bundles()[0]
	if bundle.Version != 99 {
		t.Fatalf("缓存配置版本不对: %d", bundle.Version)
	}
	if ag.State().ConfigVersion != 99 {
		t.Fatalf("当前配置版本不对: %d", ag.State().ConfigVersion)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Agent 未能在超时内退出")
	}
}

// TestBundleFromConfig 校验面板配置能被正确转换为内核配置包。
func TestBundleFromConfig(t *testing.T) {
	payload, err := client.NewConfigResponse(12, "sing-box", map[string]any{
		"inbounds": []any{map[string]any{"tag": "in"}},
	}, []client.ConfigUserRule{{
		Email: "u_1", Uid: 1, Limit: 100, DownloadSpeed: 200, UploadSpeed: 300, DeviceLimit: 4, Enabled: true,
	}}, []client.ConfigCertificate{{Name: "cert-a", Cert: "CERT", Key: "KEY"}}, true)
	if err != nil {
		t.Fatalf("构造配置失败: %v", err)
	}
	bundle, err := bundleFromConfig(&payload)
	if err != nil {
		t.Fatalf("转换配置失败: %v", err)
	}
	if bundle.Version != 12 {
		t.Fatalf("版本不对: %d", bundle.Version)
	}
	if bundle.Core != "sing-box" {
		t.Fatalf("内核类型不对: %s", bundle.Core)
	}
	if len(bundle.Rules) != 1 || bundle.Rules[0].Email != "u_1" || bundle.Rules[0].Uid != 1 {
		t.Fatalf("用户规则转换错误: %+v", bundle.Rules)
	}
	if bundle.Rules[0].DeviceLimit != 4 || !bundle.Rules[0].Enabled {
		t.Fatalf("用户规则字段转换错误: %+v", bundle.Rules[0])
	}
	if len(bundle.Certificates) != 1 || bundle.Certificates[0].Name != "cert-a" {
		t.Fatalf("证书转换错误: %+v", bundle.Certificates)
	}
	if _, ok := bundle.Config["inbounds"]; !ok {
		t.Fatalf("内核配置丢失: %+v", bundle.Config)
	}
}
