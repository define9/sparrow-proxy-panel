package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"sync"

	"sparrow/agent/internal/model"
)

// 本文件放 sing-box / xray 共用的统计辅助：email → uid 映射、JSON 注入的读写工具。

/* ---------------- email → uid ---------------- */

// directory 维护「内核里的用户标签 → 面板 uid」的映射。
//
// 有两份来源：
//   - declared：面板 rules.users（权威，由 BindUsers 注入）
//   - fromCore：从内核配置里的 inbound users（含 email/name + uid）解析出的兜底
//
// 面板下发的 sing-box 配置本身在 inbound.users 里带 uid，因此即使主循环还没调用
// BindUsers，统计也能按 uid 上报。
type directory struct {
	mu       sync.RWMutex
	declared map[string]int
	fromCore map[string]int
}

func newDirectory() *directory {
	return &directory{declared: map[string]int{}, fromCore: map[string]int{}}
}

func (d *directory) setDeclared(users []model.ConfigUser) {
	next := make(map[string]int, len(users))
	for _, user := range users {
		if user.Email == "" {
			continue
		}
		next[user.Email] = user.UID
	}
	d.mu.Lock()
	d.declared = next
	d.mu.Unlock()
}

func (d *directory) setFromCore(users map[string]int) {
	if users == nil {
		users = map[string]int{}
	}
	d.mu.Lock()
	d.fromCore = users
	d.mu.Unlock()
}

// uid 查面板 uid；匹配不上时返回 false（调用方丢弃，避免把流量记到 uid=0 上）。
func (d *directory) uid(email string) (int, bool) {
	if email == "" {
		return 0, false
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	if uid, ok := d.declared[email]; ok && uid > 0 {
		return uid, true
	}
	if uid, ok := d.fromCore[email]; ok && uid > 0 {
		return uid, true
	}
	return 0, false
}

/* ---------------- 累计值 ---------------- */

type uidTotals struct {
	upload   int64
	download int64
}

func (t uidTotals) total() int64 { return t.upload + t.download }

// sortedStats 把 uid → 累计值 转成稳定顺序的 []model.UserStat（按 uid 升序）。
func sortedStats(totals map[int]uidTotals) []model.UserStat {
	uids := make([]int, 0, len(totals))
	for uid := range totals {
		uids = append(uids, uid)
	}
	sort.Ints(uids)

	out := make([]model.UserStat, 0, len(uids))
	for _, uid := range uids {
		t := totals[uid]
		out = append(out, model.UserStat{UID: uid, Upload: t.upload, Download: t.download})
	}
	return out
}

/* ---------------- JSON 注入工具 ---------------- */

// decodeJSONObject 解码成 map，并保留数字的原始精度（uid / limit 可能超过 float64 安全范围）。
func decodeJSONObject(config []byte) (map[string]any, error) {
	if len(bytes.TrimSpace(config)) == 0 {
		return nil, fmt.Errorf("配置为空")
	}
	dec := json.NewDecoder(bytes.NewReader(config))
	dec.UseNumber()

	var root map[string]any
	if err := dec.Decode(&root); err != nil {
		return nil, fmt.Errorf("配置不是合法 JSON 对象: %w", err)
	}
	if root == nil {
		return nil, fmt.Errorf("配置不是合法的 JSON 对象")
	}
	return root, nil
}

func encodeJSONObject(root map[string]any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(root); err != nil {
		return nil, fmt.Errorf("序列化配置失败: %w", err)
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// ensureObject 取出 parent[key] 里的对象，不存在时创建。
func ensureObject(parent map[string]any, key string) map[string]any {
	if child, ok := parent[key].(map[string]any); ok && child != nil {
		return child
	}
	child := map[string]any{}
	parent[key] = child
	return child
}

// setDefault 只在字段缺失或为空时写默认值，绝不覆盖已有值。
func setDefault(obj map[string]any, key string, value any) {
	if current, ok := obj[key]; ok && current != nil {
		if s, isString := current.(string); !isString || strings.TrimSpace(s) != "" {
			return
		}
	}
	obj[key] = value
}

func setDefaultBool(obj map[string]any, key string, value bool) {
	if _, ok := obj[key]; ok {
		return
	}
	obj[key] = value
}

// jsonInt 从 JSON 数字（json.Number / float64 / string）里取出整数。
func jsonInt(value any) (int, bool) {
	switch v := value.(type) {
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return int(i), true
		}
		if f, err := v.Float64(); err == nil {
			return int(f), true
		}
	case float64:
		return int(v), true
	case int:
		return v, true
	case int64:
		return int(v), true
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return i, true
		}
	}
	return 0, false
}

// collectEmailUIDs 在内核配置里递归找「带 uid 的用户对象」，建立 email/name → uid 映射。
//
// 兼容 sing-box（inbounds[].users[]：name/email + uid）与 xray（inbounds[].settings.clients[]：email + uid）。
func collectEmailUIDs(node any) map[string]int {
	out := map[string]int{}

	var walk func(any)
	walk = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			if uid, ok := jsonInt(typed["uid"]); ok && uid > 0 {
				email, _ := typed["email"].(string)
				if strings.TrimSpace(email) == "" {
					email, _ = typed["name"].(string)
				}
				if email = strings.TrimSpace(email); email != "" {
					out[email] = uid
				}
			}
			for _, child := range typed {
				walk(child)
			}
		case []any:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(node)

	return out
}

func loggerOr(log *slog.Logger) *slog.Logger {
	if log != nil {
		return log
	}
	return slog.Default()
}
