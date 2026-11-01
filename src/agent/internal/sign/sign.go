// Package sign 实现与面板一致的 HMAC 请求签名。
//
// canonical = METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
// signature = hex(HMAC-SHA256(secret, canonical))
//
// 固定向量见 docs/architecture/agent-sign-vectors.md，Sign 必须逐字节一致。
package sign

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"
)

// SHA256EmptyBody 是空 body 的 sha256，避免每次重复计算。
const SHA256EmptyBody = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

func HashHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Canonical 拼接待签名字符串。path 只取 pathname，不含 query 与 origin。
func Canonical(method, path string, timestamp int64, nonce, body string) string {
	return strings.Join([]string{
		strings.ToUpper(method),
		path,
		strconv.FormatInt(timestamp, 10),
		nonce,
		HashHex([]byte(body)),
	}, "\n")
}

func Sign(secret, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// Nonce 生成 16 字节随机值的 hex（32 字符）。
func Nonce() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// Headers 返回一次签名所需的四个请求头。
func Headers(method, path, secret, body string, now time.Time, nonce string) map[string]string {
	ts := now.UnixMilli()
	return map[string]string{
		"X-Timestamp": strconv.FormatInt(ts, 10),
		"X-Nonce":     nonce,
		"X-Signature": Sign(secret, Canonical(method, path, ts, nonce, body)),
	}
}

// Equal 常量时间比较十六进制签名。
func Equal(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}
