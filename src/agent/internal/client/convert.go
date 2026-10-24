package client

import (
	"encoding/json"
	"fmt"
)

// 命令回执状态（契约 AgentCommandAck.status）。
const (
	// CommandAckStatusSuccess 执行成功
	CommandAckStatusSuccess = Success
	// CommandAckStatusFailed 执行失败
	CommandAckStatusFailed = Failed
)

// TrafficItem 是流量上报表条目（契约 AgentTrafficReport.items）。
//
// 字节单位一律为**字节**。
type TrafficItem struct {
	// Uid 面板侧的用户数字 ID
	Uid int64 `json:"uid"`
	// Upload 上行字节数
	Upload int64 `json:"upload"`
	// Download 下行字节数
	Download int64 `json:"download"`
}

// ConfigUserRule 是配置中的用户规则（契约 CoreUserRule）。
type ConfigUserRule struct {
	// Email 内核中的用户标识（email 标签）
	Email string `json:"email"`
	// Uid 面板侧的用户数字 ID
	Uid int64 `json:"uid"`
	// Limit 流量上限（字节），0 表示不限
	Limit int64 `json:"limit"`
	// DownloadSpeed 下行限速（bps），0 表示不限
	DownloadSpeed int64 `json:"downloadSpeed"`
	// UploadSpeed 上行限速（bps），0 表示不限
	UploadSpeed int64 `json:"uploadSpeed"`
	// DeviceLimit 设备/并发连接数上限，0 表示不限
	DeviceLimit int64 `json:"deviceLimit"`
	// Enabled 是否放行
	Enabled bool `json:"enabled"`
}

// ConfigCertificate 是配置中的证书（契约 CoreCertificate）。
type ConfigCertificate struct {
	// Name 证书名称
	Name string `json:"name"`
	// Cert PEM 内容
	Cert string `json:"cert"`
	// Key 私钥 PEM 内容
	Key string `json:"key"`
}

// NewTrafficReport 构造流量上报请求体。
func NewTrafficReport(seq int64, items []TrafficItem) AgentTrafficReport {
	converted := make([]struct {
		Download int64 `json:"download"`
		Uid      int64 `json:"uid"`

		Upload int64 `json:"upload"`
	}, 0, len(items))
	for _, item := range items {
		converted = append(converted, struct {
			Download int64 `json:"download"`
			Uid      int64 `json:"uid"`

			Upload int64 `json:"upload"`
		}{
			Download: item.Download,
			Uid:      item.Uid,
			Upload:   item.Upload,
		})
	}
	return AgentTrafficReport{Seq: seq, Items: converted}
}

// NewConfigResponse 构造配置响应。
//
// config 是内核配置本体（JSON 对象），内部会被合并进契约里的 config 字段。
func NewConfigResponse(version int64, coreType string, config map[string]any, users []ConfigUserRule, certs []ConfigCertificate, reload bool) (AgentConfigResponse, error) {
	convertedUsers := make([]struct {
		DeviceLimit   int64   `json:"deviceLimit"`
		DownloadSpeed int64   `json:"downloadSpeed"`
		Email         string  `json:"email"`
		Enabled       bool    `json:"enabled"`
		Limit         int64   `json:"limit"`
		Password      *string `json:"password,omitempty"`
		Uid           int64   `json:"uid"`
		UploadSpeed   int64   `json:"uploadSpeed"`
		Uuid          *string `json:"uuid,omitempty"`
	}, 0, len(users))
	for _, u := range users {
		convertedUsers = append(convertedUsers, struct {
			DeviceLimit   int64   `json:"deviceLimit"`
			DownloadSpeed int64   `json:"downloadSpeed"`
			Email         string  `json:"email"`
			Enabled       bool    `json:"enabled"`
			Limit         int64   `json:"limit"`
			Password      *string `json:"password,omitempty"`
			Uid           int64   `json:"uid"`
			UploadSpeed   int64   `json:"uploadSpeed"`
			Uuid          *string `json:"uuid,omitempty"`
		}{
			DeviceLimit:   u.DeviceLimit,
			DownloadSpeed: u.DownloadSpeed,
			Email:         u.Email,
			Enabled:       u.Enabled,
			Limit:         u.Limit,
			Uid:           u.Uid,
			UploadSpeed:   u.UploadSpeed,
		})
	}

	convertedCerts := make([]struct {
		Cert string `json:"cert"`
		Key  string `json:"key"`
		Name string `json:"name"`
	}, 0, len(certs))
	for _, c := range certs {
		convertedCerts = append(convertedCerts, struct {
			Cert string `json:"cert"`
			Key  string `json:"key"`
			Name string `json:"name"`
		}{
			Cert: c.Cert,
			Key:  c.Key,
			Name: c.Name,
		})
	}

	resp := AgentConfigResponse{
		Version:      version,
		Core:         AgentConfigResponseCore(coreType),
		Reload:       reload,
		Certificates: convertedCerts,
	}
	resp.Rules.Users = convertedUsers

	if len(config) > 0 {
		raw, err := json.Marshal(config)
		if err != nil {
			return resp, fmt.Errorf("client: 序列化内核配置失败: %w", err)
		}
		if err := json.Unmarshal(raw, &resp.Config); err != nil {
			return resp, fmt.Errorf("client: 解析内核配置失败: %w", err)
		}
	}
	return resp, nil
}
