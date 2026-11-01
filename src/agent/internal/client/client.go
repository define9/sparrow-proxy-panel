// Package client 是与面板通信的签名 HTTP 客户端。
// 所有请求都带 X-Node-Id / X-Timestamp / X-Nonce / X-Signature（注册除外），
// 并统一带 User-Agent: sparrow-agent/<version>。
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync/atomic"
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

	// userAgent 必须出现在每一个请求上，面板据此统计 Agent 版本分布。
	userAgent = "sparrow-agent/" + model.Version

	// CodeTimestampSkew 是面板返回的「时间偏差过大」错误码。
	CodeTimestampSkew = "AGENT_TIMESTAMP_SKEW"
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
	case "AGENT_SIGN_INVALID", CodeTimestampSkew, "AGENT_NONCE_REUSED", "AGENT_NOT_REGISTERED":
		return true
	}
	return e.StatusCode == 401
}

// AsAPIError 取出面板业务错误；返回 false 说明是传输层错误（超时 / 连接失败等）。
func AsAPIError(err error) (*APIError, bool) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr, true
	}
	return nil, false
}

// IsNetworkError 判断是否为非 HTTP 响应类错误（连接失败、超时、读写中断）。
func IsNetworkError(err error) bool {
	if err == nil {
		return false
	}
	_, ok := AsAPIError(err)
	return !ok
}

type Client struct {
	baseURL string
	nodeID  string
	secret  string
	http    *http.Client
	now     func() time.Time

	// TimeOffset 是「面板时间 - 本机时间」的估计值（纳秒）。
	// 面板返回 AGENT_TIMESTAMP_SKEW 时自动记录并重试一次，签名时间变成 now()+offset。
	TimeOffset atomic.Int64
}

func New(baseURL, nodeID, secret string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{baseURL: baseURL, nodeID: nodeID, secret: secret, http: hc, now: time.Now}
}

// SetClock 便于测试注入固定时间。
func (c *Client) SetClock(now func() time.Time) { c.now = now }

// signTime 返回用于签名的时间（已叠加时钟偏差修正）。
func (c *Client) signTime() time.Time {
	return c.now().Add(time.Duration(c.TimeOffset.Load()))
}

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
// version 首次必须是 -1（面板 configVersion 从 0 开始，发 0 会直接命中 304）。
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

// do 是唯一发请求的地方：负责签名、时钟偏差重试、解析错误、解 304。
func (c *Client) do(ctx context.Context, method, pathWithQuery string, body []byte, extra map[string]string, out interface{}) (notModified bool, err error) {
	// 签名只覆盖 pathname，query 不参与。
	pathname := pathWithQuery
	if idx := bytes.IndexByte([]byte(pathWithQuery), '?'); idx >= 0 {
		pathname = pathWithQuery[:idx]
	}

	// 最多两次：首次失败于 AGENT_TIMESTAMP_SKEW 时记录偏差后重试一次（nonce 重新生成）。
	for attempt := 0; attempt < 2; attempt++ {
		resp, payload, sendErr := c.send(ctx, method, pathname, pathWithQuery, body, extra)
		if sendErr != nil {
			return false, sendErr
		}

		switch {
		case resp.StatusCode == http.StatusNotModified:
			return true, nil

		case resp.StatusCode >= 400:
			apiErr := &APIError{StatusCode: resp.StatusCode, Code: "HTTP_" + strconv.Itoa(resp.StatusCode)}
			_ = json.Unmarshal(payload, apiErr)
			if attempt == 0 && apiErr.Code == CodeTimestampSkew {
				if offset, ok := clockOffset(resp, c.now()); ok {
					c.TimeOffset.Store(int64(offset))
					continue // 用修正后的时间重试一次
				}
			}
			return false, apiErr

		default:
			if out != nil && len(payload) > 0 {
				if unmarshalErr := json.Unmarshal(payload, out); unmarshalErr != nil {
					return false, fmt.Errorf("解析响应失败: %w", unmarshalErr)
				}
			}
			return false, nil
		}
	}

	// 两次都因时钟偏差失败：不再重试，避免死循环。
	return false, &APIError{StatusCode: http.StatusUnauthorized, Code: CodeTimestampSkew, Message: "时间偏差修正后仍被面板拒绝"}
}

// send 组装并发送一次请求，返回已读完的响应与 body。
func (c *Client) send(ctx context.Context, method, pathname, pathWithQuery string, body []byte, extra map[string]string) (*http.Response, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+pathWithQuery, bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)

	for k, v := range extra {
		req.Header.Set(k, v)
	}

	if c.nodeID != "" && c.secret != "" {
		nonce, nonceErr := sign.Nonce()
		if nonceErr != nil {
			return nil, nil, nonceErr
		}
		headers := sign.Headers(method, pathname, c.secret, string(body), c.signTime(), nonce)
		req.Header.Set("X-Node-Id", c.nodeID)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	payload, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if readErr != nil {
		return resp, nil, readErr
	}
	return resp, payload, nil
}

// clockOffset 用响应头 Date 估算「面板时间 - 本机时间」。
// Date 只有秒级精度，取整到秒即可（签名窗口是 5 分钟）。
func clockOffset(resp *http.Response, local time.Time) (time.Duration, bool) {
	raw := resp.Header.Get("Date")
	if raw == "" {
		return 0, false
	}
	serverTime, err := http.ParseTime(raw)
	if err != nil || serverTime.IsZero() {
		return 0, false
	}
	return serverTime.Sub(local).Round(time.Second), true
}

// PathConfig 暴露给需要展示的 CLI（status）。
func PathConfig() string { return pathConfig }
