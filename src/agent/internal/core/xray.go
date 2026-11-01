package core

// xray 的统计来自 gRPC stats.query（stats: true + api 配置）。
// 由 Agent 侧负责实现；默认返回空统计，保证不阻塞心跳与流量上报。

type xray struct {
	*processCore
}

func newXray(opts Options) *xray {
	return &xray{processCore: newProcessCore("xray", opts)}
}
