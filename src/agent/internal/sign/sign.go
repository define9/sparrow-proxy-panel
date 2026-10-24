// Package sign 实现节点端与面板端之间的 HMAC-SHA256 请求签名。
//
// 规范化字符串（canonical）必须与面板端**逐字节一致**：
//
//	METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
//
// 约定：
//   - METHOD 为 HTTP 方法，统一大写（GET / POST）
//   - PATH 为请求路径（含前导 "/"，不含查询串）
//   - TIMESTAMP 为 Unix **毫秒**时间戳的十进制字符串
//   - NONCE 为随机串（16 字节随机数的十六进制，32 个小写 hex 字符）
//   - SHA256(body) 为请求体的 SHA-256 十六进制摘要（小写）；请求体为空时
//     使用空字符串的 SHA-256（即 e3b0c442...b855）
//   - 分隔符是单个 LF（0x0A），结尾**不带**换行
//
// 面板端（src/panel）必须使用同一组测试向量，见 internal/sign/sign_test.go。
package sign

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

// 签名相关的请求头名称。
const (
	HeaderNodeID    = "X-Node-Id"
	HeaderTimestamp = "X-Timestamp"
	HeaderNonce     = "X-Nonce"
	HeaderSignature = "X-Signature"
)

// EmptyBodyHash 是空请求体的 SHA-256 十六进制摘要（小写）。
// 当请求体为空（例如 GET 请求）时，canonical 的最后一段必须是这个值。
const EmptyBodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// ErrInvalidSignature 表示签名校验失败。
var ErrInvalidSignature = errors.New("sign: 签名校验失败")

// BodyHash 返回请求体的 SHA-256 十六进制摘要（小写）。
// body 为 nil 或空切片时返回 EmptyBodyHash。
func BodyHash(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// Canonical 构造待签名的规范化字符串。
//
// 参数：
//   - method：HTTP 方法，大小写不敏感（内部统一转大写）
//   - path：请求路径，必须以 "/" 开头
//   - timestamp：Unix 毫秒时间戳的十进制字符串
//   - nonce：随机串
//   - body：请求体原始字节（可为 nil）
func Canonical(method, path, timestamp, nonce string, body []byte) string {
	var sb strings.Builder
	sb.Grow(len(method) + len(path) + len(timestamp) + len(nonce) + 96)
	sb.WriteString(strings.ToUpper(method))
	sb.WriteByte('\n')
	sb.WriteString(path)
	sb.WriteByte('\n')
	sb.WriteString(timestamp)
	sb.WriteByte('\n')
	sb.WriteString(nonce)
	sb.WriteByte('\n')
	sb.WriteString(BodyHash(body))
	return sb.String()
}

// Sign 返回 canonical 的 HMAC-SHA256 十六进制签名（小写）。
func Sign(secret, method, path, timestamp, nonce string, body []byte) string {
	return SignCanonical(secret, Canonical(method, path, timestamp, nonce, body))
}

// SignCanonical 返回给定 canonical 字符串的 HMAC-SHA256 十六进制签名（小写）。
func SignCanonical(secret, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify 校验签名是否正确，使用常量时间比较，防止时序攻击。
//
// signature 必须是**小写十六进制**的签名串（与 Sign 的输出逐字节一致）；
// 非法十六进制或大写形式一律判定为校验失败。
func Verify(secret, method, path, timestamp, nonce string, body []byte, signature string) bool {
	want := Sign(secret, method, path, timestamp, nonce, body)
	return hmac.Equal([]byte(want), []byte(strings.TrimSpace(signature)))
}

// VerifyCanonical 校验给定 canonical 的签名，使用常量时间比较。
func VerifyCanonical(secret, canonical, signature string) bool {
	want := SignCanonical(secret, canonical)
	return hmac.Equal([]byte(want), []byte(strings.TrimSpace(signature)))
}

// Nonce 生成一个 16 字节随机数的十六进制字符串（32 个小写 hex 字符）。
func Nonce() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// Headers 是一次签名请求所需要的全部请求头。
//
// timestamp 与 nonce 为空时会自动生成（timestamp = 当前 Unix 毫秒）。
type Headers struct {
	NodeID    string
	Timestamp string
	Nonce     string
	Signature string
}

// SignHeaders 为一次请求生成签名请求头。
//
// body 必须是**最终发送出去的字节**（序列化之后的 JSON），否则面板端算出的
// 摘要与 Agent 不一致，签名必然校验失败。
func SignHeaders(nodeID, secret, method, path string, body []byte) (Headers, error) {
	nonce, err := Nonce()
	if err != nil {
		return Headers{}, err
	}
	timestamp := TimestampMillis()
	return SignHeadersWith(nodeID, secret, method, path, timestamp, nonce, body), nil
}

// TimestampMillis 返回当前时间的 Unix 毫秒时间戳字符串。
func TimestampMillis() string {
	return strconv.FormatInt(time.Now().UnixMilli(), 10)
}

// SignHeadersWith 使用给定的 timestamp 与 nonce 生成签名请求头（便于测试与复现）。
func SignHeadersWith(nodeID, secret, method, path, timestamp, nonce string, body []byte) Headers {
	return Headers{
		NodeID:    nodeID,
		Timestamp: timestamp,
		Nonce:     nonce,
		Signature: Sign(secret, method, path, timestamp, nonce, body),
	}
}
