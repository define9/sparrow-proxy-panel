//go:build !linux

package agent

// 非 Linux 平台不采集系统指标，心跳里对应字段留空（契约允许 null）。

// cpuUsagePercent 返回 -1（未知）。
func cpuUsagePercent() float64 { return -1 }

// memoryUsagePercent 返回 -1（未知）。
func memoryUsagePercent() float64 { return -1 }

// diskUsagePercent 返回 -1（未知）。
func diskUsagePercent(_ string) float64 { return -1 }
