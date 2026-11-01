package core

// sing-box 的统计来自 Clash API（experimental.clash_api）。
// 由 Agent 侧负责实现：读取 /traffic 与 /connections，按 user/email 汇总为 uid 累计值。
// 默认实现先返回空，避免内核不可用时阻塞上报。

type singBox struct {
	*processCore
}

func newSingBox(opts Options) *singBox {
	return &singBox{processCore: newProcessCore("sing-box", opts)}
}
