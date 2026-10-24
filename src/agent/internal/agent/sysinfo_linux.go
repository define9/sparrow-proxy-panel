//go:build linux

package agent

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

var (
	cpuMu       sync.Mutex
	cpuPrevIdle uint64
	cpuPrevTot  uint64
	cpuPrimed   bool
)

// cpuUsagePercent 通过 /proc/stat 计算 CPU 使用率（0-100）。
//
// 第一次调用没有基线，返回 -1（表示未知，字段留空）。
func cpuUsagePercent() float64 {
	raw, err := os.ReadFile("/proc/stat")
	if err != nil {
		return -1
	}
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		var total, idle uint64
		for i, f := range fields[1:] {
			v, err := strconv.ParseUint(f, 10, 64)
			if err != nil {
				return -1
			}
			total += v
			// 第 4 列是 idle，第 5 列是 iowait
			if i == 3 || i == 4 {
				idle += v
			}
		}
		cpuMu.Lock()
		defer cpuMu.Unlock()
		if !cpuPrimed {
			cpuPrevIdle, cpuPrevTot, cpuPrimed = idle, total, true
			return -1
		}
		totalDelta := total - cpuPrevTot
		idleDelta := idle - cpuPrevIdle
		cpuPrevIdle, cpuPrevTot = idle, total
		if totalDelta == 0 {
			return -1
		}
		usage := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
		if usage < 0 {
			return 0
		}
		if usage > 100 {
			return 100
		}
		return usage
	}
	return -1
}

// memoryUsagePercent 通过 /proc/meminfo 计算内存使用率（0-100）。
func memoryUsagePercent() float64 {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return -1
	}
	defer file.Close()

	var total, available float64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseFloat(fields[1], 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			total = value
		case "MemAvailable:":
			available = value
		}
	}
	if total <= 0 {
		return -1
	}
	if available <= 0 {
		return -1
	}
	usage := (total - available) / total * 100
	if usage < 0 {
		return 0
	}
	if usage > 100 {
		return 100
	}
	return usage
}

// diskUsagePercent 通过 statfs 计算磁盘使用率（0-100）。
func diskUsagePercent(path string) float64 {
	if path == "" {
		return -1
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return -1
	}
	total := stat.Blocks
	if total == 0 {
		return -1
	}
	free := stat.Bfree
	usage := float64(total-free) / float64(total) * 100
	if usage < 0 {
		return 0
	}
	if usage > 100 {
		return 100
	}
	return usage
}
