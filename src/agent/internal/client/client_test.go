package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sparrows/sparrow-agent/internal/sign"
)

const (
	testNodeID = "9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"
	testSecret = "unit-test-key-01"
)

// newTestServer 启动一个校验签名的测试服务端。
func newTestServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request, body []byte)) (*httptest.Server, *[]string) {
	t.Helper()
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, r.URL.Path)
		handler(w, r, body)
	}))
	t.Cleanup(server.Close)
	return server, &seen
}

// assertSignature 校验请求携带了合法的签名头。
func assertSignature(t *testing.T, r *http.Request, body []byte) {
	t.Helper()
	if r.Header.Get(sign.HeaderNodeID) != testNodeID {
		t.Fatalf("缺少 %s: %q", sign.HeaderNodeID, r.Header.Get(sign.HeaderNodeID))
	}
	timestamp := r.Header.Get(sign.HeaderTimestamp)
	nonce := r.Header.Get(sign.HeaderNonce)
	signature := r.Header.Get(sign.HeaderSignature)
	if timestamp == "" || nonce == "" || signature == "" {
		t.Fatal("缺少签名请求头")
	}
	if !sign.Verify(testSecret, r.Method, r.URL.Path, timestamp, nonce, body, signature) {
		t.Fatal("签名校验失败（canonical 与契约不一致）")
	}
}

// TestHeartbeatSignsRequest 校验心跳请求带签名且能通过面板校验。
func TestHeartbeatSignsRequest(t *testing.T) {
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		assertSignature(t, r, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ack":true,"configVersion":42,"minAgentVersion":"1.0.0"}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	resp, err := c.Heartbeat(context.Background(), AgentHeartbeatRequest{
		Status:       "online",
		NetRx:        1024,
		NetTx:        2048,
		AgentVersion: "1.0.0",
		ReportedAt:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("心跳失败: %v", err)
	}
	if !resp.Ack || resp.ConfigVersion != 42 {
		t.Fatalf("心跳响应解析错误: %+v", resp)
	}
}

// TestFetchConfigNotModified 校验 304 被识别为「配置未变更」。
func TestFetchConfigNotModified(t *testing.T) {
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		assertSignature(t, r, body)
		if r.Header.Get("X-Config-Version") != "42" {
			t.Fatalf("缺少 X-Config-Version 请求头")
		}
		w.WriteHeader(http.StatusNotModified)
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	_, err = c.FetchConfig(context.Background(), 42)
	if err != ErrNotModified {
		t.Fatalf("应当返回 ErrNotModified，实际 %v", err)
	}
}

// TestFetchConfigPayload 校验配置响应能被正确解析（含未知字段兼容）。
func TestFetchConfigPayload(t *testing.T) {
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		assertSignature(t, r, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"version": 42,
			"core": "sing-box",
			"config": {"inbounds": [{"tag": "in"}], "unknownField": 1},
			"rules": {"users": [{"email":"u_1","uid":1001,"limit":10,"downloadSpeed":0,"uploadSpeed":0,"deviceLimit":0,"enabled":true}]},
			"certificates": [{"name":"cert-a","cert":"C","key":"K"}],
			"reload": true
		}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	resp, err := c.FetchConfig(context.Background(), 0)
	if err != nil {
		t.Fatalf("拉取配置失败: %v", err)
	}
	if resp.Version != 42 || resp.Core != AgentConfigResponseCore("sing-box") {
		t.Fatalf("配置响应解析错误: %+v", resp)
	}
	if len(resp.Rules.Users) != 1 || resp.Rules.Users[0].Uid != 1001 {
		t.Fatalf("用户规则解析错误: %+v", resp.Rules.Users)
	}
	if len(resp.Certificates) != 1 || resp.Certificates[0].Name != "cert-a" {
		t.Fatalf("证书解析错误: %+v", resp.Certificates)
	}
	// 未知字段必须被保留（面板新增字段时 Agent 不能崩）
	raw, err := json.Marshal(resp.Config)
	if err != nil {
		t.Fatalf("序列化配置失败: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("反序列化配置失败: %v", err)
	}
	if _, ok := decoded["unknownField"]; !ok {
		t.Fatalf("未知字段丢失: %s", raw)
	}
}

// TestReportTrafficPayload 校验流量上报的报文结构与契约一致。
func TestReportTrafficPayload(t *testing.T) {
	var received map[string]any
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		assertSignature(t, r, body)
		if err := json.Unmarshal(body, &received); err != nil {
			t.Fatalf("解析请求体失败: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":1,"seq":1024}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	report := NewTrafficReport(1024, []TrafficItem{{Uid: 1001, Upload: 1048576, Download: 10485760}})
	resp, err := c.ReportTraffic(context.Background(), report)
	if err != nil {
		t.Fatalf("上报流量失败: %v", err)
	}
	if resp.Accepted != 1 || resp.Seq != 1024 {
		t.Fatalf("流量响应解析错误: %+v", resp)
	}
	if received["seq"].(float64) != 1024 {
		t.Fatalf("seq 不对: %v", received["seq"])
	}
	items, ok := received["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("items 不对: %v", received["items"])
	}
	item := items[0].(map[string]any)
	if item["uid"].(float64) != 1001 {
		t.Fatalf("uid 不对: %v", item["uid"])
	}
	if item["upload"].(float64) != 1048576 || item["download"].(float64) != 10485760 {
		t.Fatalf("字节数不对: %v", item)
	}
}

// TestAckCommand 校验命令回执的路径与签名。
func TestAckCommand(t *testing.T) {
	server, paths := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		assertSignature(t, r, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	err = c.AckCommand(context.Background(), "11111111-2222-4333-8444-555555555555", AgentCommandAck{
		Status: CommandAckStatusSuccess,
	})
	if err != nil {
		t.Fatalf("命令回执失败: %v", err)
	}
	if len(*paths) != 1 || (*paths)[0] != "/api/v1/agent/commands/11111111-2222-4333-8444-555555555555/ack" {
		t.Fatalf("回执路径不对: %v", *paths)
	}
}

// TestAPIError 校验面板错误响应被转换为 APIError。
func TestAPIError(t *testing.T) {
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"statusCode":401,"code":"AGENT_SIGN_INVALID","message":"签名无效"}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	_, err = c.Heartbeat(context.Background(), AgentHeartbeatRequest{Status: "online", ReportedAt: time.Now().UTC()})
	if err == nil {
		t.Fatal("应当返回错误")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("应当返回 APIError，实际 %T: %v", err, err)
	}
	if apiErr.StatusCode != 401 || apiErr.Code != "AGENT_SIGN_INVALID" {
		t.Fatalf("错误信息解析错误: %+v", apiErr)
	}
}

// TestRegisterUsesToken 校验注册使用一次性令牌而不是签名。
func TestRegisterUsesToken(t *testing.T) {
	server, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		if r.Header.Get("X-Registration-Token") != "registration-token-123" {
			t.Fatal("缺少 X-Registration-Token 请求头")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"nodeId":"9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d","nodeSecret":"0123456789abcdef","heartbeatInterval":30,"configPollInterval":300}`))
	})
	c, err := New(Options{BaseURL: server.URL, NodeID: testNodeID, Secret: testSecret})
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	resp, err := c.Register(context.Background(), "registration-token-123", AgentRegisterRequest{
		Hostname: "node-1", AgentVersion: "1.0.0", Os: "linux", Arch: "amd64",
	})
	if err != nil {
		t.Fatalf("注册失败: %v", err)
	}
	if resp.NodeId.String() != testNodeID {
		t.Fatalf("nodeId 解析错误: %s", resp.NodeId)
	}
	if resp.HeartbeatInterval != 30 || resp.ConfigPollInterval != 300 {
		t.Fatalf("注册响应解析错误: %+v", resp)
	}
}

// TestNewRejectsInvalidNodeID 校验非法节点 ID 被拒绝。
func TestNewRejectsInvalidNodeID(t *testing.T) {
	if _, err := New(Options{BaseURL: "http://x", NodeID: "not-a-uuid", Secret: testSecret}); err == nil {
		t.Fatal("非法节点 ID 应当报错")
	}
	if _, err := New(Options{BaseURL: "", NodeID: testNodeID, Secret: testSecret}); err == nil {
		t.Fatal("空地址应当报错")
	}
}
