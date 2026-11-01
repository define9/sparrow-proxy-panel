// Package client 是与面板通信的签名 HTTP 客户端。
// 所有请求都带 X-Node-Id / X-Timestamp / X-Nonce / X-Signature（注册除外）。
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"sparrow/agent/internal/model"
	"sparrow/agent/internal/sign"
)

const (
	pathRegister  = "/api/v1/agent/register"
	pathHeartbeat = "/api/v1/agent/heartbeat"
	pathConfig    = "/api/v1/agent/config"
	pathTraffic   = "/api/v1/agent/traffic"
	pathCommands  = "/api/v1/agent/commands"
)

// APIError 对应面板的 { statusCode, code, message }。
type APIError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("panel %d %s: %s", e.StatusCode, e.Code, e.Message)
}

// IsAuthError 用于判断是否需要重新注册。
func (e *APIError) IsAuthError() bool {
	switch e.Code {
	case "AGENT_SIGN_INVALID", "AGENT_TIMESTAMP_SKEW", "AGENT_NONCE_REUSED", "AGENT_NOT_REGISTERED":
		return true
	}
	return e.StatusCode == 401
}

type Client struct {
	baseURL string
	nodeID  string
	secret  string
	http    *http.Client
	now     func() time.Time
}

func New(baseURL, nodeID, secret string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{baseURL: baseURL, nodeID: nodeID, secret: secret, http: hc, now: time.Now}
}

// SetClock 便于测试注入固定时间。
func (c *Client) SetClock(now func() time.Time) { c.now = now }

// Register 用一次性注册令牌换取 nodeSecret（不需要签名）。
func (c *Client) Register(ctx context.Context, token string, req model.RegisterRequest) (*model.RegisterResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var out model.RegisterResponse
	if _, err := c.do(ctx, http.MethodPost, pathRegister, body, map[string]string{
		"X-Registration-Token": token,
	}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Heartbeat(ctx context.Context, req model.HeartbeatRequest) (*model.HeartbeatResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	var out model.HeartbeatResponse
	if _, err := c.do(ctx, http.MethodPost, pathHeartbeat, body, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// FetchConfig 拉配置；当面板返回 304 时 notModified=true 且 resp 为 nil。
func (c *Client) FetchConfig(ctx context.Context, version int) (*model.ConfigResponse, bool, error) {
	headers := map[string]string{"X-Config-Version": strconv.Itoa(version)}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var out model.ConfigResponse
	notModified, err := c.do(ctx, http.MethodGet, pathConfig, nil, headers, &out)
	if err != nil {
		return nil, false, err
	}
	if notModified {
		return nil, true, nil
	}
	return &out, false, nil
}

func (c *Client) ReportTraffic(ctx context.Context, report model.TrafficReport) (*model.TrafficResult, error) {
	body, err := json.Marshal(report)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	var out model.TrafficResult
	if _, err := c.do(ctx, http.MethodPost, pathTraffic, body, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// FetchCommands 长轮询待执行命令；timeout 由面板决定（最长 25s）。
func (c *Client) FetchCommands(ctx context.Context, wait time.Duration) ([]model.Command, error) {
	query := url.Values{}
	if wait > 0 {
		query.Set("wait", strconv.Itoa(int(wait/time.Second)))
	}
	path := pathCommands
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	ctx, cancel := context.WithTimeout(ctx, wait+15*time.Second)
	defer cancel()

	var out model.CommandsResponse
	if _, err := c.do(ctx, http.MethodGet, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Commands, nil
}

func (c *Client) AckCommand(ctx context.Context, id string, ack model.CommandAck) error {
	body, err := json.Marshal(ack)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	_, err = c.do(ctx, http.MethodPost, pathCommands+"/"+id+"/ack", body, nil, nil)
	return err
}

// do 是唯一发请求的地方：负责签名、解析错误、解 304。
func (c *Client) do(ctx context.Context, method, pathWithQuery string, body []byte, extra map[string]string, out interface{}) (notModified bool, err error) {
	// 签名只覆盖 pathname，query 不参与。
	pathname := pathWithQuery
	if idx := bytes.IndexByte([]byte(pathWithQuery), '?'); idx >= 0 {
		pathname = pathWithQuery[:idx]
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+pathWithQuery, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	for k, v := range extra {
		req.Header.Set(k, v)
	}

	if c.nodeID != "" && c.secret != "" {
		nonce, nonceErr := sign.Nonce()
		if nonceErr != nil {
			return false, nonceErr
		}
		headers := sign.Headers(method, pathname, c.secret, string(body), c.now(), nonce)
		req.Header.Set("X-Node-Id", c.nodeID)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return true, nil
	}

	payload, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if readErr != nil {
		return false, readErr
	}

	if resp.StatusCode >= 400 {
		apiErr := &APIError{StatusCode: resp.StatusCode, Code: "HTTP_" + strconv.Itoa(resp.StatusCode)}
		_ = json.Unmarshal(payload, apiErr)
		return false, apiErr
	}

	if out != nil && len(payload) > 0 {
		if err := json.Unmarshal(payload, out); err != nil {
			return false, fmt.Errorf("解析响应失败: %w", err)
		}
	}
	return false, nil
}

// PathConfig 暴露给需要展示的 CLI（status）。
func PathConfig() string { return pathConfig }
