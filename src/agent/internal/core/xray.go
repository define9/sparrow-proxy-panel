package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"sparrow/agent/internal/model"
)

// xray 的统计来自 gRPC stats.query：
//
//	xray api statsquery --server=127.0.0.1:10085 -pattern "user>>>"
//
// 需要配置里 api + stats + policy 都开启，因此 Apply 前做本地参数注入。
const (
	xrayAPIListen    = "127.0.0.1:10085"
	xrayStatsTimeout = 5 * time.Second
)

type xray struct {
	*processCore
	dir *directory
	log *slog.Logger
}

func newXray(opts Options) *xray {
	return &xray{
		processCore: newProcessCore("xray", opts),
		dir:         newDirectory(),
		log:         loggerOr(opts.Logger),
	}
}

// SetUsers 接收面板 rules.users 的 email → uid 映射（权威来源）。
func (x *xray) SetUsers(users []model.ConfigUser) {
	x.dir.setDeclared(users)
}

// Apply 先注入 api / stats / policy，再走通用流程。
func (x *xray) Apply(ctx context.Context, config []byte) error {
	injected, users, err := injectXrayConfig(config)
	if err != nil {
		return err
	}
	x.dir.setFromCore(users)
	return x.processCore.Apply(ctx, injected)
}

// injectXrayConfig 保证统计与 API 相关配置存在；已有字段一律保留（只补缺失项）。
func injectXrayConfig(config []byte) (injected []byte, users map[string]int, err error) {
	root, err := decodeJSONObject(config)
	if err != nil {
		return nil, nil, err
	}

	// api：暴露 gRPC 统计接口。
	api := ensureObject(root, "api")
	setDefault(api, "tag", "api")
	setDefault(api, "listen", xrayAPIListen)
	mergeStrings(api, "services", "HandlerService", "LoggerService", "StatsService")

	// stats：开启统计模块（值为空对象即可）。
	ensureObject(root, "stats")

	// policy：按用户 + 入站统计上下行。
	policy := ensureObject(root, "policy")
	levels := ensureObject(policy, "levels")
	level0 := ensureObject(levels, "0")
	setDefaultBool(level0, "statsUserUplink", true)
	setDefaultBool(level0, "statsUserDownlink", true)
	system := ensureObject(policy, "system")
	setDefaultBool(system, "statsInboundUplink", true)
	setDefaultBool(system, "statsInboundDownlink", true)

	out, err := encodeJSONObject(root)
	if err != nil {
		return nil, nil, err
	}
	return out, collectEmailUIDs(root), nil
}

// mergeStrings 确保 obj[key] 里包含给定元素，保留已有元素与顺序。
func mergeStrings(obj map[string]any, key string, required ...string) {
	var values []string
	switch current := obj[key].(type) {
	case []any:
		for _, item := range current {
			if s, ok := item.(string); ok {
				values = append(values, s)
			}
		}
	case []string:
		values = append(values, current...)
	}

	seen := make(map[string]bool, len(values))
	for _, v := range values {
		seen[v] = true
	}
	for _, req := range required {
		if !seen[req] {
			values = append(values, req)
			seen[req] = true
		}
	}

	list := make([]any, 0, len(values))
	for _, v := range values {
		list = append(list, v)
	}
	obj[key] = list
}

/* ---------------- 统计 ---------------- */

type xrayStat struct {
	Name  string          `json:"name"`
	Value json.RawMessage `json:"value"`
}

// Stats 执行 statsquery 并按 email 汇总成 uid 累计值。
func (x *xray) Stats(ctx context.Context) ([]model.UserStat, error) {
	ctx, cancel := context.WithTimeout(ctx, xrayStatsTimeout)
	defer cancel()

	output, err := exec.CommandContext(ctx, x.opts.Binary,
		"api", "statsquery", "--server="+xrayAPIListen, "-pattern", "user>>>",
	).CombinedOutput()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("找不到 xray 可执行文件 %q: %w", x.opts.Binary, err)
		}
		return nil, fmt.Errorf("执行 xray api statsquery 失败: %w: %s", err, strings.TrimSpace(string(output)))
	}

	stats, err := parseXrayStats(output)
	if err != nil {
		return nil, err
	}

	totals := map[int]uidTotals{}
	for _, stat := range stats {
		email, direction, ok := parseXrayStatName(stat.Name)
		if !ok {
			continue
		}
		uid, found := x.dir.uid(email)
		if !found {
			// 内核里有计数但面板没下发这个用户 → 丢弃（不记到 uid=0）。
			continue
		}
		value := stat.int64()
		if value < 0 {
			continue
		}
		current := totals[uid]
		if direction == "uplink" {
			current.upload += value
		} else {
			current.download += value
		}
		totals[uid] = current
	}

	return sortedStats(totals), nil
}

// parseXrayStats 兼容 {"stat":[{name,value}]} 与裸数组两种输出。
func parseXrayStats(raw []byte) ([]xrayStat, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("xray api statsquery 输出为空")
	}

	if bytes.HasPrefix(trimmed, []byte("{")) {
		var envelope struct {
			Stat []xrayStat `json:"stat"`
		}
		if err := json.Unmarshal(trimmed, &envelope); err != nil {
			return nil, fmt.Errorf("解析 xray api statsquery 输出失败: %w: %s", err, snippet(trimmed))
		}
		return envelope.Stat, nil
	}

	var list []xrayStat
	if err := json.Unmarshal(trimmed, &list); err != nil {
		return nil, fmt.Errorf("解析 xray api statsquery 输出失败: %w: %s", err, snippet(trimmed))
	}
	return list, nil
}

// parseXrayStatName 拆解 user>>>{email}>>>traffic>>>{uplink|downlink}。
func parseXrayStatName(name string) (email, direction string, ok bool) {
	parts := strings.Split(name, ">>>")
	if len(parts) != 4 || parts[0] != "user" || parts[2] != "traffic" {
		return "", "", false
	}
	email = strings.TrimSpace(parts[1])
	direction = strings.TrimSpace(parts[3])
	if email == "" || (direction != "uplink" && direction != "downlink") {
		return "", "", false
	}
	return email, direction, true
}

// int64 解析 value：xray 输出里通常是字符串，少数版本是数字。
func (s xrayStat) int64() int64 {
	raw := bytes.TrimSpace(s.Value)
	if len(raw) == 0 {
		return 0
	}

	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		value, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		if err != nil {
			return 0
		}
		return value
	}

	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		if value, err := number.Int64(); err == nil {
			return value
		}
		if value, err := number.Float64(); err == nil {
			return int64(value)
		}
	}
	return 0
}

// OnlineUsers 复用 connections 不可得，退回统计里的活跃用户数（据此近似）。
func (x *xray) OnlineUsers(ctx context.Context) (int, error) {
	stats, err := x.Stats(ctx)
	if err != nil {
		return 0, err
	}
	uids := make(map[int]struct{}, len(stats))
	for _, stat := range stats {
		uids[stat.UID] = struct{}{}
	}
	return len(uids), nil
}

func snippet(raw []byte) string {
	const limit = 200
	if len(raw) > limit {
		return string(raw[:limit]) + "..."
	}
	return string(raw)
}
