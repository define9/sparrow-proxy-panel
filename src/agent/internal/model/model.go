// Package model 定义 Agent 与面板之间的线协议结构。
// 字段名与 src/panel/lib/api/node-schemas.ts、lib/agent/config.ts 一一对应，改动必须两边同步。
package model

import "encoding/json"

const Version = "0.1.0"

/* ---------------- 注册 ---------------- */

type RegisterRequest struct {
	Hostname     string `json:"hostname,omitempty"`
	IP           string `json:"ip,omitempty"`
	AgentVersion string `json:"agentVersion,omitempty"`
	OS           string `json:"os,omitempty"`
	Arch         string `json:"arch,omitempty"`
}

type RegisterResponse struct {
	NodeID              string `json:"nodeId"`
	NodeSecret          string `json:"nodeSecret"`
	HeartbeatInterval   int    `json:"heartbeatInterval"`
	ConfigPollInterval  int    `json:"configPollInterval"`
}

/* ---------------- 心跳 ---------------- */

type HeartbeatRequest struct {
	Status       string  `json:"status"`
	CPU          float64 `json:"cpu"`
	Memory       float64 `json:"memory"`
	Disk         float64 `json:"disk"`
	NetRx        int64   `json:"netRx"`
	NetTx        int64   `json:"netTx"`
	OnlineUsers  int     `json:"onlineUsers"`
	AgentVersion string  `json:"agentVersion,omitempty"`
	CoreVersion  string  `json:"coreVersion,omitempty"`
	Core         string  `json:"core,omitempty"`
	ReportedAt   string  `json:"reportedAt,omitempty"`
}

type HeartbeatResponse struct {
	Ack             bool   `json:"ack"`
	ConfigVersion   int    `json:"configVersion"`
	MinAgentVersion string `json:"minAgentVersion"`
}

/* ---------------- 配置下发 ---------------- */

type ConfigUser struct {
	Email         string `json:"email"`
	UID           int    `json:"uid"`
	Limit         int64  `json:"limit"`
	DownloadSpeed int    `json:"downloadSpeed"`
	UploadSpeed   int    `json:"uploadSpeed"`
}

type Certificate struct {
	Name string `json:"name"`
	Cert string `json:"cert"`
	Key  string `json:"key"`
}

type ConfigResponse struct {
	Version      int             `json:"version"`
	Core         string          `json:"core"`
	Config       json.RawMessage `json:"config"`
	Rules        struct {
		Users []ConfigUser `json:"users"`
	} `json:"rules"`
	Certificates []Certificate `json:"certificates"`
	Reload       bool          `json:"reload"`
}

/* ---------------- 流量上报 ---------------- */

type TrafficItem struct {
	UID      int   `json:"uid"`
	Upload   int64 `json:"upload"`
	Download int64 `json:"download"`
}

type TrafficReport struct {
	Seq   int64         `json:"seq"`
	Items []TrafficItem `json:"items"`
}

type TrafficResult struct {
	Accepted  int   `json:"accepted"`
	Seq       int64 `json:"seq"`
	Duplicate bool  `json:"duplicate,omitempty"`
}

/* ---------------- 命令 ---------------- */

type Command struct {
	ID        string          `json:"id"`
	Command   string          `json:"command"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	IssuedAt  string          `json:"issuedAt,omitempty"`
}

type CommandsResponse struct {
	Commands []Command `json:"commands"`
}

type CommandAck struct {
	Status string          `json:"status"`
	Result json.RawMessage `json:"result,omitempty"`
}

/* ---------------- 内核统计 ---------------- */

// UserStat 是内核侧累计值（不是增量），Agent 负责做差。
type UserStat struct {
	UID      int
	Upload   int64
	Download int64
}
