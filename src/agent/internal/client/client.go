// Package client 在 oapi-codegen 生成的契约客户端之上，封装 Agent 与面板之间的调用。
//
// 本文件是**手写**的业务封装（生成物见 api.gen.go，勿手改）：
//   - 统一注入 HMAC 签名请求头（X-Node-Id / X-Timestamp / X-Nonce / X-Signature）
//   - 统一处理非 2xx 响应（解析面板的错误响应体）
//   - 处理 GET /agent/config 的 304 Not Modified
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/sparrows/sparrow-agent/internal/sign"
)

// 面板端 Agent 接口路径（与 packages/contracts/openapi.json 一致）。
const (
	PathRegister  = "/api/v1/agent/register"
	PathHeartbeat = "/api/v1/agent/heartbeat"
	PathConfig    = "/api/v1/agent/config"
	PathTraffic   = "/api/v1/agent/traffic"
	PathCommands  = "/api/v1/agent/commands"
	PathEvents    = "/api/v1/agent/events"
)

// maxResponseBytes 限制响应体大小，防止面板异常导致 Agent 内存暴涨。
const maxResponseBytes = 16 << 20

// ErrNotModified 表示面板返回 304（配置未变化）。
var ErrNotModified = errors.New("client: 配置未变更")

// APIError 是面板返回的业务错误。
type APIError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
}

// Error 实现 error 接口。
func (e *APIError) Error() string {
	if e.Code == "" {
		return fmt.Sprintf("面板返回 %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("面板返回 %d [%s]: %s", e.StatusCode, e.Code, e.Message)
}

// Options 是 AgentClient 的构造参数。
type Options struct {
	// BaseURL 是面板地址，例如 https://panel.example.com
	BaseURL string
	// NodeID 是节点 ID（UUID 字符串）
	NodeID string
	// Secret 是节点密钥
	Secret string
	// HTTPClient 可选，默认使用带超时的标准客户端
	HTTPClient *http.Client
	// Logger 可选
	Logger *slog.Logger
	// Now 可选，便于测试注入固定时钟
	Now func() time.Time
}

// AgentClient 是面板 API 的封装。
type AgentClient struct {
	inner     *Client
	nodeID    uuid.UUID
	nodeIDStr string
	secret    string
	log       *slog.Logger
	now       func() time.Time
}

// New 构造 AgentClient。
func New(opts Options) (*AgentClient, error) {
	if opts.BaseURL == "" {
		return nil, errors.New("client: 面板地址不能为空")
	}
	nodeID, err := uuid.Parse(opts.NodeID)
	if err != nil {
		return nil, fmt.Errorf("client: 节点 ID 非法: %w", err)
	}
	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        32,
				MaxIdleConnsPerHost: 8,
				IdleConnTimeout:     90 * time.Second,
			},
		}
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	inner, err := NewClient(opts.BaseURL, WithHTTPClient(httpClient))
	if err != nil {
		return nil, fmt.Errorf("client: 初始化面板客户端失败: %w", err)
	}
	return &AgentClient{
		inner:     inner,
		nodeID:    nodeID,
		nodeIDStr: nodeID.String(),
		secret:    opts.Secret,
		log:       logger,
		now:       now,
	}, nil
}

// NodeID 返回节点 ID（UUID 字符串）。
func (c *AgentClient) NodeID() string { return c.nodeIDStr }

// signHeaders 计算一次请求的签名请求头。
//
// body 必须是**最终发出的字节**；调用方需保证签名用的字节与写入请求体的字节完全一致。
func (c *AgentClient) signHeaders(method, path string, body []byte) (sign.Headers, error) {
	nonce, err := sign.Nonce()
	if err != nil {
		return sign.Headers{}, fmt.Errorf("client: 生成 nonce 失败: %w", err)
	}
	timestamp := strconv.FormatInt(c.now().UnixMilli(), 10)
	return sign.SignHeadersWith(c.nodeIDStr, c.secret, method, path, timestamp, nonce, body), nil
}

// debugf 记录调试日志（不含任何密钥）。
func (c *AgentClient) debugf(path string, err error) {
	if c.log != nil && err != nil {
		c.log.Debug("面板请求失败", "path", path, "error", err.Error())
	}
}

// Register 注册节点（一次性 registration token）。
//
// 注册接口不使用 HMAC 签名，只带 X-Registration-Token 请求头。
func (c *AgentClient) Register(ctx context.Context, token string, req AgentRegisterRequest) (*AgentRegisterResponse, error) {
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("client: 序列化注册请求失败: %w", err)
	}
	params := &PostApiV1AgentRegisterParams{XRegistrationToken: token}
	resp, err := c.inner.PostApiV1AgentRegisterWithBody(ctx, params, "application/json", bytes.NewReader(raw))
	if err != nil {
		c.debugf(PathRegister, err)
		return nil, fmt.Errorf("client: 注册请求失败: %w", err)
	}
	out := &AgentRegisterResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// Heartbeat 上报心跳。
func (c *AgentClient) Heartbeat(ctx context.Context, req AgentHeartbeatRequest) (*AgentHeartbeatResponse, error) {
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("client: 序列化心跳失败: %w", err)
	}
	headers, err := c.signHeaders(http.MethodPost, PathHeartbeat, raw)
	if err != nil {
		return nil, err
	}
	params := &PostApiV1AgentHeartbeatParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	resp, err := c.inner.PostApiV1AgentHeartbeatWithBody(ctx, params, "application/json", bytes.NewReader(raw))
	if err != nil {
		c.debugf(PathHeartbeat, err)
		return nil, fmt.Errorf("client: 心跳请求失败: %w", err)
	}
	out := &AgentHeartbeatResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// FetchConfig 拉取节点配置。
//
// version 大于 0 时会带上 X-Config-Version 请求头；面板返回 304 时
// 返回 ErrNotModified（配置未变化）。
func (c *AgentClient) FetchConfig(ctx context.Context, version int64) (*AgentConfigResponse, error) {
	headers, err := c.signHeaders(http.MethodGet, PathConfig, nil)
	if err != nil {
		return nil, err
	}
	params := &GetApiV1AgentConfigParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	if version > 0 {
		v := strconv.FormatInt(version, 10)
		params.XConfigVersion = &v
	}
	resp, err := c.inner.GetApiV1AgentConfig(ctx, params)
	if err != nil {
		c.debugf(PathConfig, err)
		return nil, fmt.Errorf("client: 拉取配置失败: %w", err)
	}
	if resp.StatusCode == http.StatusNotModified {
		closeBody(resp)
		return nil, ErrNotModified
	}
	out := &AgentConfigResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// ReportTraffic 上报流量增量。
func (c *AgentClient) ReportTraffic(ctx context.Context, req AgentTrafficReport) (*AgentTrafficResponse, error) {
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("client: 序列化流量上报失败: %w", err)
	}
	headers, err := c.signHeaders(http.MethodPost, PathTraffic, raw)
	if err != nil {
		return nil, err
	}
	params := &PostApiV1AgentTrafficParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	resp, err := c.inner.PostApiV1AgentTrafficWithBody(ctx, params, "application/json", bytes.NewReader(raw))
	if err != nil {
		c.debugf(PathTraffic, err)
		return nil, fmt.Errorf("client: 流量上报失败: %w", err)
	}
	out := &AgentTrafficResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// FetchCommands 拉取待执行命令（长轮询）。
func (c *AgentClient) FetchCommands(ctx context.Context) (*AgentCommandsResponse, error) {
	headers, err := c.signHeaders(http.MethodGet, PathCommands, nil)
	if err != nil {
		return nil, err
	}
	params := &GetApiV1AgentCommandsParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	resp, err := c.inner.GetApiV1AgentCommands(ctx, params)
	if err != nil {
		c.debugf(PathCommands, err)
		return nil, fmt.Errorf("client: 拉取命令失败: %w", err)
	}
	out := &AgentCommandsResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// AckCommand 回执命令执行结果。
func (c *AgentClient) AckCommand(ctx context.Context, id string, ack AgentCommandAck) error {
	cmdID, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("client: 命令 ID 非法: %w", err)
	}
	raw, err := json.Marshal(ack)
	if err != nil {
		return fmt.Errorf("client: 序列化命令回执失败: %w", err)
	}
	path := PathCommands + "/" + cmdID.String() + "/ack"
	headers, err := c.signHeaders(http.MethodPost, path, raw)
	if err != nil {
		return err
	}
	params := &PostApiV1AgentCommandsIdAckParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	resp, err := c.inner.PostApiV1AgentCommandsIdAckWithBody(ctx, cmdID, params, "application/json", bytes.NewReader(raw))
	if err != nil {
		c.debugf(path, err)
		return fmt.Errorf("client: 命令回执失败: %w", err)
	}
	return decodeJSON(resp, nil)
}

// ReportEvent 上报事件。
func (c *AgentClient) ReportEvent(ctx context.Context, ev AgentEvent) (*AgentEventsResponse, error) {
	raw, err := json.Marshal(ev)
	if err != nil {
		return nil, fmt.Errorf("client: 序列化事件失败: %w", err)
	}
	headers, err := c.signHeaders(http.MethodPost, PathEvents, raw)
	if err != nil {
		return nil, err
	}
	params := &PostApiV1AgentEventsParams{
		XNodeId:    openapi_types.UUID(c.nodeID),
		XTimestamp: headers.Timestamp,
		XNonce:     headers.Nonce,
		XSignature: headers.Signature,
	}
	resp, err := c.inner.PostApiV1AgentEventsWithBody(ctx, params, "application/json", bytes.NewReader(raw))
	if err != nil {
		c.debugf(PathEvents, err)
		return nil, fmt.Errorf("client: 事件上报失败: %w", err)
	}
	out := &AgentEventsResponse{}
	if err := decodeJSON(resp, out); err != nil {
		return nil, err
	}
	return out, nil
}

// decodeJSON 读取响应体并按需反序列化，同时把非 2xx 响应转成 APIError。
func decodeJSON(resp *http.Response, out any) error {
	defer closeBody(resp)
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return fmt.Errorf("client: 读取响应体失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if len(data) > 0 {
			_ = json.Unmarshal(data, apiErr)
		}
		if apiErr.Message == "" {
			apiErr.Message = http.StatusText(resp.StatusCode)
		}
		return apiErr
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("client: 解析响应体失败: %w", err)
	}
	return nil
}

// closeBody 关闭并释放响应体。
func closeBody(resp *http.Response) {
	if resp == nil || resp.Body == nil {
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))
	_ = resp.Body.Close()
}
