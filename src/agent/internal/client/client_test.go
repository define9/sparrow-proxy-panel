package client

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparrow/agent/internal/model"
)

/* ============================================================
 * 假面板：独立实现 canonical + HMAC 验签（不复用 internal/sign），
 * 这样客户端签名逻辑出错时测试会失败，而不是两边一起错。
 * ============================================================ */

const (
	testSecret = "test-node-secret"
	testNodeID = "11111111-2222-3333-4444-555555555555"

	// 与面板 sign.ts 一致的校验窗口。
	signWindow = 5 * time.Minute
)

type verifyError struct {
	status  int
	code    string
	message string
}

type fakePanel struct {
	mu sync.Mutex

	configVersion int
	usedNonces    map[string]time.Time
	heartbeats    int
	trafficFail   int // 剩余失败次数（模拟面板 5xx）

	lastUA               string
	lastPath             string
	lastConfigVersionHdr string
	lastNonce            string
	lastSignature        string
}

func newFakePanel(t *testing.T) (*fakePanel, *httptest.Server) {
	t.Helper()
	p := &fakePanel{configVersion: 3, usedNonces: map[string]time.Time{}}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/agent/heartbeat", p.signed(func(w http.ResponseWriter, r *http.Request, body []byte) {
		p.mu.Lock()
		p.heartbeats++
		p.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"ack": true, "configVersion": p.version(), "minAgentVersion": "1.0.0"})
	}))
	mux.HandleFunc("/api/v1/agent/config", p.signed(func(w http.ResponseWriter, r *http.Request, body []byte) {
		current := strconv.Itoa(p.version())
		if r.Header.Get("X-Config-Version") == current {
			w.Header().Set("X-Config-Version", current)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("X-Config-Version", current)
		writeJSON(w, http.StatusOK, map[string]any{
			"version": p.version(),
			"core":    "sing-box",
			"config":  map[string]any{"log": map[string]any{"level": "info"}},
			"rules":   map[string]any{"users": []any{}},
			"reload":  true,
		})
	}))
	mux.HandleFunc("/api/v1/agent/traffic", p.signed(func(w http.ResponseWriter, r *http.Request, body []byte) {
		p.mu.Lock()
		fail := p.trafficFail > 0
		if fail {
			p.trafficFail--
		}
		p.mu.Unlock()
		if fail {
			writeAPIError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "数据库暂时不可用")
			return
		}
		var report model.TrafficReport
		_ = json.Unmarshal(body, &report)
		writeJSON(w, http.StatusOK, map[string]any{"accepted": len(report.Items), "seq": report.Seq})
	}))
	mux.HandleFunc("/api/v1/agent/commands", p.signed(func(w http.ResponseWriter, r *http.Request, body []byte) {
		writeJSON(w, http.StatusOK, map[string]any{"commands": []any{}})
	}))

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return p, srv
}

func (p *fakePanel) version() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.configVersion
}

func (p *fakePanel) signed(h func(http.ResponseWriter, *http.Request, []byte)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)

		p.mu.Lock()
		p.lastUA = r.Header.Get("User-Agent")
		p.lastPath = r.URL.Path
		p.lastConfigVersionHdr = r.Header.Get("X-Config-Version")
		p.lastNonce = r.Header.Get("X-Nonce")
		p.lastSignature = r.Header.Get("X-Signature")
		p.mu.Unlock()

		if verr := p.verify(r, body); verr != nil {
			writeAPIError(w, verr.status, verr.code, verr.message)
			return
		}
		h(w, r, body)
	}
}

// verify 按面板 auth.ts 的顺序：时间窗 → 验签 → nonce 去重。
func (p *fakePanel) verify(r *http.Request, body []byte) *verifyError {
	nodeID := r.Header.Get("X-Node-Id")
	timestamp := r.Header.Get("X-Timestamp")
	nonce := r.Header.Get("X-Nonce")
	signature := r.Header.Get("X-Signature")

	if nodeID != testNodeID || timestamp == "" || nonce == "" || signature == "" {
		return &verifyError{http.StatusUnauthorized, "AGENT_SIGN_INVALID", "缺少签名请求头"}
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return &verifyError{http.StatusUnauthorized, "AGENT_SIGN_INVALID", "X-Timestamp 不合法"}
	}
	if absDuration(time.Since(time.UnixMilli(ts))) > signWindow {
		return &verifyError{http.StatusUnauthorized, "AGENT_TIMESTAMP_SKEW", "请求时间与服务器时间偏差超过 5 分钟"}
	}

	// 独立实现：canonical = METHOD\nPATH\nTIMESTAMP\nNONCE\nsha256(body)
	sum := sha256.Sum256(body)
	canonical := strings.Join([]string{
		strings.ToUpper(r.Method),
		r.URL.Path,
		timestamp,
		nonce,
		hex.EncodeToString(sum[:]),
	}, "\n")
	expected := hmacHex(testSecret, canonical)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return &verifyError{http.StatusUnauthorized, "AGENT_SIGN_INVALID", "签名校验失败"}
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if expiresAt, ok := p.usedNonces[nonce]; ok && time.Now().Before(expiresAt) {
		return &verifyError{http.StatusBadRequest, "AGENT_NONCE_REUSED", "nonce 已使用，疑似重放请求"}
	}
	p.usedNonces[nonce] = time.Now().Add(10 * time.Minute)
	return nil
}

func hmacHex(secret, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func canonicalFor(method, path string, ts int64, nonce string, body []byte) string {
	sum := sha256.Sum256(body)
	return strings.Join([]string{
		strings.ToUpper(method),
		path,
		strconv.FormatInt(ts, 10),
		nonce,
		hex.EncodeToString(sum[:]),
	}, "\n")
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeAPIError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"statusCode": status, "code": code, "message": message})
}

func newTestClient(srv *httptest.Server) *Client {
	return New(srv.URL, testNodeID, testSecret, srv.Client())
}

/* ============================================================
 * 用例
 * ============================================================ */

// 正常签名通过；User-Agent 必带；nonce 每次唯一；config 首包版本 -1。
func TestSignedRequestsVerifiedAndNoncesUnique(t *testing.T) {
	panel, srv := newFakePanel(t)
	c := newTestClient(srv)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if _, err := c.Heartbeat(ctx, model.HeartbeatRequest{Status: "online"}); err != nil {
			t.Fatalf("第 %d 次心跳应通过验签，实际错误: %v", i+1, err)
		}
	}

	// 首次拉配置必须带 -1（面板版本从 0 开始，发 0 会命中 304）。
	if _, notModified, err := c.FetchConfig(ctx, -1); err != nil || notModified {
		t.Fatalf("FetchConfig(-1) 期望拿到配置，err=%v notModified=%v", err, notModified)
	}
	if got := panel.lastConfigVersionHdr; got != "-1" {
		t.Fatalf("X-Config-Version 期望 -1，实际 %q", got)
	}

	if _, err := c.FetchCommands(ctx, 5*time.Second); err != nil {
		t.Fatalf("拉取命令失败: %v", err)
	}

	panel.mu.Lock()
	nonces := len(panel.usedNonces)
	ua := panel.lastUA
	path := panel.lastPath
	panel.mu.Unlock()

	if nonces != 5 {
		t.Fatalf("期望 5 个唯一 nonce，实际 %d", nonces)
	}
	if want := "sparrow-agent/" + model.Version; ua != want {
		t.Fatalf("User-Agent 期望 %q，实际 %q", want, ua)
	}
	// query 不参与签名：服务端看到的 path 不含 ?wait=
	if path != "/api/v1/agent/commands" {
		t.Fatalf("签名 path 应只含 pathname，实际 %q", path)
	}
	if panel.heartbeats != 3 {
		t.Fatalf("期望 3 次心跳，实际 %d", panel.heartbeats)
	}
}

// 篡改 body 后签名不再匹配 → 401 AGENT_SIGN_INVALID。
func TestTamperedBodyRejected(t *testing.T) {
	_, srv := newFakePanel(t)

	signedBody := []byte(`{"status":"online"}`)
	sentBody := []byte(`{"status":"offline"}`)
	ts := time.Now().UnixMilli()
	nonce := "abcdef0123456789"

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/agent/heartbeat", bytes.NewReader(sentBody))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Node-Id", testNodeID)
	req.Header.Set("X-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("X-Nonce", nonce)
	// 用 signedBody 计算签名，实际发送 sentBody
	req.Header.Set("X-Signature", hmacHex(testSecret, canonicalFor(http.MethodPost, "/api/v1/agent/heartbeat", ts, nonce, signedBody)))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("篡改 body 应返回 401，实际 %d", resp.StatusCode)
	}
	var apiErr APIError
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "AGENT_SIGN_INVALID" {
		t.Fatalf("期望 AGENT_SIGN_INVALID，实际 %q", apiErr.Code)
	}
}

// 同一个 nonce 重放 → 第二次 400 AGENT_NONCE_REUSED。
func TestReplayedNonceRejected(t *testing.T) {
	_, srv := newFakePanel(t)

	body := []byte(`{"status":"online"}`)
	ts := time.Now().UnixMilli()
	nonce := "0011223344556677"
	signature := hmacHex(testSecret, canonicalFor(http.MethodPost, "/api/v1/agent/heartbeat", ts, nonce, body))

	send := func() (*http.Response, error) {
		req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/agent/heartbeat", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("X-Node-Id", testNodeID)
		req.Header.Set("X-Timestamp", strconv.FormatInt(ts, 10))
		req.Header.Set("X-Nonce", nonce)
		req.Header.Set("X-Signature", signature)
		return http.DefaultClient.Do(req)
	}

	first, err := send()
	if err != nil {
		t.Fatal(err)
	}
	first.Body.Close()
	if first.StatusCode != http.StatusOK {
		t.Fatalf("首次请求应成功，实际 %d", first.StatusCode)
	}

	second, err := send()
	if err != nil {
		t.Fatal(err)
	}
	defer second.Body.Close()
	if second.StatusCode != http.StatusBadRequest {
		t.Fatalf("重放 nonce 应返回 400，实际 %d", second.StatusCode)
	}
	var apiErr APIError
	if err := json.NewDecoder(second.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "AGENT_NONCE_REUSED" {
		t.Fatalf("期望 AGENT_NONCE_REUSED，实际 %q", apiErr.Code)
	}
}

// config 304 分支：版本一致时返回 notModified=true 且 resp 为 nil。
func TestFetchConfigNotModified(t *testing.T) {
	_, srv := newFakePanel(t)
	c := newTestClient(srv)
	ctx := context.Background()

	resp, notModified, err := c.FetchConfig(ctx, 3)
	if err != nil {
		t.Fatalf("304 不应报错: %v", err)
	}
	if !notModified || resp != nil {
		t.Fatalf("版本一致应 304，得到 notModified=%v resp=%v", notModified, resp)
	}

	resp, notModified, err = c.FetchConfig(ctx, 2)
	if err != nil {
		t.Fatalf("拉取配置失败: %v", err)
	}
	if notModified || resp == nil || resp.Version != 3 {
		t.Fatalf("版本不一致应返回完整配置，得到 notModified=%v resp=%+v", notModified, resp)
	}
}

// 错误响应必须解析成 *APIError，且 code / statusCode 正确。
func TestAPIErrorParsing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAPIError(w, http.StatusForbidden, "NODE_DISABLED", "节点已被禁用")
	}))
	defer srv.Close()

	c := newTestClient(srv)
	_, err := c.Heartbeat(context.Background(), model.HeartbeatRequest{Status: "online"})
	if err == nil {
		t.Fatal("期望返回错误")
	}

	apiErr, ok := AsAPIError(err)
	if !ok {
		t.Fatalf("期望 *APIError，实际 %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusForbidden {
		t.Fatalf("StatusCode 期望 403，实际 %d", apiErr.StatusCode)
	}
	if apiErr.Code != "NODE_DISABLED" {
		t.Fatalf("Code 期望 NODE_DISABLED，实际 %q", apiErr.Code)
	}
	if IsNetworkError(err) {
		t.Fatal("面板 4xx/5xx 不应被判定为网络错误")
	}
}

// 时钟偏差：面板返回 AGENT_TIMESTAMP_SKEW 后记录偏移并重试一次。
func TestClockSkewRetriesWithOffset(t *testing.T) {
	panel, srv := newFakePanel(t)
	c := newTestClient(srv)

	// 本机时钟快 10 分钟（超过面板 5 分钟窗口）。
	skew := 10 * time.Minute
	c.SetClock(func() time.Time { return time.Now().Add(skew) })

	resp, err := c.Heartbeat(context.Background(), model.HeartbeatRequest{Status: "online"})
	if err != nil {
		t.Fatalf("时钟偏差应自动修正并重试成功，实际错误: %v", err)
	}
	if !resp.Ack {
		t.Fatal("期望 ack=true")
	}

	offset := time.Duration(c.TimeOffset.Load())
	if offset > -9*time.Minute {
		t.Fatalf("期望记录约 -10m 的偏移，实际 %v", offset)
	}
	if panel.heartbeats != 1 {
		t.Fatalf("重试成功后只应有一次成功心跳，实际 %d", panel.heartbeats)
	}

	// 修正后的后续请求直接通过，不再触发偏差分支。
	c.SetClock(time.Now)
	if _, err := c.Heartbeat(context.Background(), model.HeartbeatRequest{Status: "online"}); err != nil {
		t.Fatalf("携带偏移的后续请求应成功: %v", err)
	}
}

// 连接失败属于传输层错误，不能被当成面板业务错误。
func TestNetworkErrorDetection(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close() // 立刻关闭，连接必然失败

	c := New(url, testNodeID, testSecret, &http.Client{Timeout: time.Second})
	_, err := c.Heartbeat(context.Background(), model.HeartbeatRequest{Status: "online"})
	if err == nil {
		t.Fatal("期望连接失败")
	}
	if !IsNetworkError(err) {
		t.Fatalf("期望判定为网络错误，实际 %T: %v", err, err)
	}
	found := ""
	if _, ok := AsAPIError(err); ok {
		found = err.Error()
	}
	if found != "" {
		t.Fatalf("不应解析出 APIError: %s", found)
	}
}

// 确保测试侧独立实现与共享签名向量一致（防止 fake panel 与客户端一起写错）。
func TestCanonicalMatchesSharedVector(t *testing.T) {
	// 向量 1：GET /api/v1/agent/config，ts=1767225600000，nonce=a1b2c3d4e5f6a7b8，空 body
	const vectorSecret = "sparrow-test-secret"
	got := hmacHex(vectorSecret, canonicalFor(http.MethodGet, "/api/v1/agent/config", 1767225600000, "a1b2c3d4e5f6a7b8", nil))
	const want = "91763bac5cb712a255c639ae593a5ef49dda36104ffee7de8bb23aea44522ad4"
	if got != want {
		t.Fatalf("签名向量不一致: got %s want %s", got, want)
	}
	if fmt.Sprintf("%x", sha256.Sum256(nil)) != "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" {
		t.Fatal("空 body 的 sha256 与文档不一致")
	}
}
