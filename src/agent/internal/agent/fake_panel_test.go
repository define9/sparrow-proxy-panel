package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/sign"
)

// fakePanel 是一个可离线运行的假面板，实现 Agent 协议的全部接口。
//
// 它会校验 HMAC 签名（与面板端使用同一套 canonical 规则），
// 并记录心跳、配置、流量上报与命令回执，供测试断言。
type fakePanel struct {
	server *httptest.Server

	mu sync.Mutex

	nodeID            string
	secret            string
	registrationToken string

	configVersion int64
	configPayload *client.AgentConfigResponse

	commands []client.AgentCommand
	acks     []client.AgentCommandAck
	// ackedCommands 记录已回执的命令 ID
	ackedCommands []string

	heartbeats []client.AgentHeartbeatRequest
	traffic    []client.AgentTrafficReport
	registers  int

	// trafficFail 为 true 时流量上报返回 500（模拟面板不可用）
	trafficFail bool
	// commandsServed 记录命令是否已经被投递过
	commandsServed bool
	// lastConfigVersionHeader 记录面板看到的 X-Config-Version
	lastConfigVersionHeader string
}

// newFakePanel 启动假面板。
func newFakePanel(t *testing.T) *fakePanel {
	t.Helper()
	p := &fakePanel{
		nodeID:            "9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
		secret:            "unit-test-key-01",
		registrationToken: "registration-token-123",
		configVersion:     42,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/agent/register", p.handleRegister)
	mux.HandleFunc("/api/v1/agent/heartbeat", p.handleHeartbeat)
	mux.HandleFunc("/api/v1/agent/config", p.handleConfig)
	mux.HandleFunc("/api/v1/agent/traffic", p.handleTraffic)
	mux.HandleFunc("/api/v1/agent/commands", p.handleCommands)
	mux.HandleFunc("/api/v1/agent/commands/", p.handleAck)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"statusCode": 404,
			"code":       "NOT_FOUND",
			"message":    "未知路径 " + r.URL.Path,
		})
	})
	p.server = httptest.NewServer(mux)
	t.Cleanup(p.server.Close)
	return p
}

// URL 返回面板地址。
func (p *fakePanel) URL() string { return p.server.URL }

// verify 校验请求签名。
func (p *fakePanel) verify(r *http.Request, body []byte) error {
	if got := r.Header.Get(sign.HeaderNodeID); got != p.nodeID {
		return fmt.Errorf("节点 ID 不匹配: %q", got)
	}
	timestamp := r.Header.Get(sign.HeaderTimestamp)
	nonce := r.Header.Get(sign.HeaderNonce)
	signature := r.Header.Get(sign.HeaderSignature)
	if timestamp == "" || nonce == "" || signature == "" {
		return errors.New("缺少签名请求头")
	}
	if !sign.Verify(p.secret, r.Method, r.URL.Path, timestamp, nonce, body, signature) {
		return fmt.Errorf("签名校验失败")
	}
	return nil
}

// handleRegister 处理注册。
func (p *fakePanel) handleRegister(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if r.Header.Get("X-Registration-Token") != p.registrationToken {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AUTH_INVALID_CREDENTIALS",
			"message":    "注册令牌无效",
		})
		return
	}
	var req client.AgentRegisterRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"statusCode": 422,
			"code":       "VALIDATION_FAILED",
			"message":    "参数校验失败",
		})
		return
	}
	p.mu.Lock()
	p.registers++
	p.mu.Unlock()
	writeJSON(w, http.StatusOK, client.AgentRegisterResponse{
		NodeId:             mustUUID(p.nodeID),
		NodeSecret:         p.secret,
		HeartbeatInterval:  30,
		ConfigPollInterval: 300,
	})
}

// handleHeartbeat 处理心跳。
func (p *fakePanel) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err := p.verify(r, body); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AGENT_SIGN_INVALID",
			"message":    err.Error(),
		})
		return
	}
	var req client.AgentHeartbeatRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"statusCode": 422,
			"code":       "VALIDATION_FAILED",
			"message":    "参数校验失败",
		})
		return
	}
	p.mu.Lock()
	p.heartbeats = append(p.heartbeats, req)
	version := p.configVersion
	p.mu.Unlock()
	writeJSON(w, http.StatusOK, client.AgentHeartbeatResponse{
		Ack:           true,
		ConfigVersion: version,
	})
}

// handleConfig 处理配置拉取（版本一致返回 304）。
func (p *fakePanel) handleConfig(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err := p.verify(r, body); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AGENT_SIGN_INVALID",
			"message":    err.Error(),
		})
		return
	}
	p.mu.Lock()
	p.lastConfigVersionHeader = r.Header.Get("X-Config-Version")
	version := p.configVersion
	payload := p.configPayload
	p.mu.Unlock()

	if payload == nil {
		writeJSON(w, http.StatusOK, map[string]any{"version": version})
		return
	}
	if header := r.Header.Get("X-Config-Version"); header != "" && header == fmt.Sprintf("%d", version) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

// handleTraffic 处理流量上报。
func (p *fakePanel) handleTraffic(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err := p.verify(r, body); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AGENT_SIGN_INVALID",
			"message":    err.Error(),
		})
		return
	}
	p.mu.Lock()
	fail := p.trafficFail
	p.mu.Unlock()
	if fail {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"statusCode": 500,
			"code":       "INTERNAL_ERROR",
			"message":    "模拟故障",
		})
		return
	}
	var req client.AgentTrafficReport
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"statusCode": 422,
			"code":       "VALIDATION_FAILED",
			"message":    "参数校验失败",
		})
		return
	}
	p.mu.Lock()
	p.traffic = append(p.traffic, req)
	accepted := len(req.Items)
	p.mu.Unlock()
	writeJSON(w, http.StatusAccepted, client.AgentTrafficResponse{
		Accepted: int64(accepted),
		Seq:      req.Seq,
	})
}

// handleCommands 处理命令长轮询（命令只投递一次）。
func (p *fakePanel) handleCommands(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err := p.verify(r, body); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AGENT_SIGN_INVALID",
			"message":    err.Error(),
		})
		return
	}
	p.mu.Lock()
	var commands []client.AgentCommand
	if !p.commandsServed {
		p.commandsServed = true
		commands = p.commands
	}
	p.mu.Unlock()
	if commands == nil {
		commands = []client.AgentCommand{}
	}
	writeJSON(w, http.StatusOK, client.AgentCommandsResponse{Commands: commands})
}

// handleAck 处理命令回执。
func (p *fakePanel) handleAck(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err := p.verify(r, body); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"statusCode": 401,
			"code":       "AGENT_SIGN_INVALID",
			"message":    err.Error(),
		})
		return
	}
	var ack client.AgentCommandAck
	if err := json.Unmarshal(body, &ack); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"statusCode": 422,
			"code":       "VALIDATION_FAILED",
			"message":    "参数校验失败",
		})
		return
	}
	id := r.URL.Path[len("/api/v1/agent/commands/") : len(r.URL.Path)-len("/ack")]
	p.mu.Lock()
	p.acks = append(p.acks, ack)
	p.ackedCommands = append(p.ackedCommands, id)
	p.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// setConfig 设置面板下发的配置。
func (p *fakePanel) setConfig(version int64, users []client.ConfigUserRule) {
	payload, err := client.NewConfigResponse(version, "sing-box", map[string]any{
		"inbounds": []any{
			map[string]any{"type": "mixed", "tag": "mixed-in", "listen": "0.0.0.0", "listen_port": 2080},
		},
		"outbounds": []any{
			map[string]any{"type": "direct", "tag": "direct"},
		},
	}, users, nil, true)
	if err != nil {
		panic(err)
	}
	p.mu.Lock()
	p.configVersion = version
	p.configPayload = &payload
	p.mu.Unlock()
}

// setCommands 设置待投递的命令。
func (p *fakePanel) setCommands(commands []client.AgentCommand) {
	p.mu.Lock()
	p.commands = commands
	p.commandsServed = false
	p.mu.Unlock()
}

// heartbeatCount 返回收到的心跳次数。
func (p *fakePanel) heartbeatCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.heartbeats)
}

// trafficReports 返回收到的流量上报。
func (p *fakePanel) trafficReports() []client.AgentTrafficReport {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]client.AgentTrafficReport, len(p.traffic))
	copy(out, p.traffic)
	return out
}

// commandAcks 返回命令回执。
func (p *fakePanel) commandAcks() []client.AgentCommandAck {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]client.AgentCommandAck, len(p.acks))
	copy(out, p.acks)
	return out
}

// setTrafficFail 设置流量上报是否失败。
func (p *fakePanel) setTrafficFail(fail bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.trafficFail = fail
}

// writeJSON 输出 JSON 响应。
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// mustUUID 解析 UUID，失败时 panic（测试辅助）。
func mustUUID(s string) openapi_types.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		panic(err)
	}
	return id
}

// waitFor 轮询等待条件成立，超时则失败。
func waitFor(t *testing.T, timeout time.Duration, desc string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待超时: %s", desc)
}

// contextWithTimeout 是测试里常用的上下文。
func contextWithTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
