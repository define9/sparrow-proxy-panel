// Package metrics 提供一个极简的 Prometheus 文本格式指标注册表。
//
// 只依赖标准库，够用即可：Agent 暴露的指标数量很少（心跳成功率、
// 配置版本、内核存活、流量速率等）。
package metrics

import (
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// 类型常量。
const (
	TypeCounter = "counter"
	TypeGauge   = "gauge"
)

// Registry 是指标注册表。
type Registry struct {
	mu       sync.RWMutex
	order    []string
	metrics  map[string]*metric
	helpText map[string]string
}

// metric 是单个指标（含标签维度）。
type metric struct {
	name    string
	typ     string
	help    string
	order   []string
	samples map[string]*sample
}

// sample 是某个标签组合下的指标值。
type sample struct {
	labels map[string]string
	value  float64
}

// New 创建注册表。
func New() *Registry {
	return &Registry{
		metrics:  map[string]*metric{},
		helpText: map[string]string{},
	}
}

// Register 注册一个指标（幂等）。
func (r *Registry) Register(name, typ, help string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.registerLocked(name, typ, help)
}

// registerLocked 注册指标（调用方持有锁）。
func (r *Registry) registerLocked(name, typ, help string) *metric {
	if m, ok := r.metrics[name]; ok {
		return m
	}
	m := &metric{name: name, typ: typ, help: help, samples: map[string]*sample{}}
	r.metrics[name] = m
	r.order = append(r.order, name)
	return m
}

// Inc 计数器加一。
func (r *Registry) Inc(name string, labels map[string]string) {
	r.Add(name, labels, 1)
}

// Add 计数器增加指定值。
func (r *Registry) Add(name string, labels map[string]string, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m := r.registerLocked(name, TypeCounter, r.helpText[name])
	key := labelKey(labels)
	s, ok := m.samples[key]
	if !ok {
		s = &sample{labels: copyLabels(labels)}
		m.samples[key] = s
		m.order = append(m.order, key)
	}
	s.value += delta
}

// Set 设置指标值（gauge）。
func (r *Registry) Set(name string, labels map[string]string, value float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m := r.registerLocked(name, TypeGauge, r.helpText[name])
	key := labelKey(labels)
	s, ok := m.samples[key]
	if !ok {
		s = &sample{labels: copyLabels(labels)}
		m.samples[key] = s
		m.order = append(m.order, key)
	}
	s.value = value
}

// SetHelp 设置指标说明（需要在第一次写入前调用才有意义）。
func (r *Registry) SetHelp(name, help string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.helpText[name] = help
	if m, ok := r.metrics[name]; ok {
		m.help = help
	}
}

// Value 读取指标当前值（不存在时返回 0）。
func (r *Registry) Value(name string, labels map[string]string) float64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.metrics[name]
	if !ok {
		return 0
	}
	s, ok := m.samples[labelKey(labels)]
	if !ok {
		return 0
	}
	return s.value
}

// Render 输出 Prometheus 文本格式。
func (r *Registry) Render(w io.Writer) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.order))
	seen := map[string]bool{}
	for _, n := range r.order {
		if !seen[n] {
			seen[n] = true
			names = append(names, n)
		}
	}
	sort.Strings(names)

	for _, name := range names {
		m := r.metrics[name]
		if m.help != "" {
			fmt.Fprintf(w, "# HELP %s %s\n", name, m.help)
		}
		fmt.Fprintf(w, "# TYPE %s %s\n", name, m.typ)
		keys := make([]string, 0, len(m.order))
		for k := range m.samples {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			s := m.samples[k]
			fmt.Fprintf(w, "%s%s %s\n", name, formatLabels(s.labels), formatValue(s.value))
		}
	}
}

// labelKey 计算标签组合的唯一键。
func labelKey(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+labels[k])
	}
	return strings.Join(parts, ",")
}

// copyLabels 复制标签表。
func copyLabels(labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels))
	for k, v := range labels {
		out[k] = v
	}
	return out
}

// formatLabels 输出 `{k="v",k2="v2"}` 形式。
func formatLabels(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%q", k, labels[k]))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// formatValue 输出指标值。
func formatValue(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}
