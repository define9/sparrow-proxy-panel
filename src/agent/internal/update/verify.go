package update

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
)

// CanonicalSHA256JSON 把 sha256 字典序列化成待签名的 canonical JSON：
// 键按字母序、分隔符 "," 与 ":"、不含空白。
//
// 实现直接复用 encoding/json 对 map 的确定性输出（map 键自动排序、紧凑格式），
// platform 键与 hex 摘要都不含需要 HTML 转义的字符，因此结果稳定可复现。
func CanonicalSHA256JSON(sums map[string]string) []byte {
	if sums == nil {
		sums = map[string]string{}
	}
	encoded, err := json.Marshal(sums)
	if err != nil {
		// map[string]string 不可能序列化失败；退化成空对象避免 panic。
		return []byte("{}")
	}
	return encoded
}

// SignSHA256JSON 用私钥对 sha256 字典签名，返回 base64 字符串。
// 发布脚本与测试共用，保证与 VerifySHA256JSON 使用同一套 canonical 规则。
func SignSHA256JSON(priv ed25519.PrivateKey, sums map[string]string) (string, error) {
	if len(priv) != ed25519.PrivateKeySize {
		return "", fmt.Errorf("ed25519 私钥长度非法: %d", len(priv))
	}
	sig := ed25519.Sign(priv, CanonicalSHA256JSON(sums))
	return base64.StdEncoding.EncodeToString(sig), nil
}

// VerifySHA256JSON 校验 base64 的 ed25519 签名。
func VerifySHA256JSON(publicKey string, sums map[string]string, sigB64 string) error {
	pub, err := ParsePublicKey(publicKey)
	if err != nil {
		return err
	}
	sig, err := decodeSignature(sigB64)
	if err != nil {
		return err
	}
	if !ed25519.Verify(pub, CanonicalSHA256JSON(sums), sig) {
		return ErrSignatureInvalid
	}
	return nil
}

// ParsePublicKey 支持三种写法，方便运维直接粘贴：
//   - 裸 base64（32 字节原始公钥）："Gv…="
//   - 带前缀： "ed25519:Gv…="
//   - PEM：-----BEGIN PUBLIC KEY-----（PKIX，openssl 默认输出）
func ParsePublicKey(raw string) (ed25519.PublicKey, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, errors.New("public_key 为空")
	}
	s = strings.TrimPrefix(s, "ed25519:")
	s = strings.TrimPrefix(s, "ED25519:")
	s = strings.TrimSpace(s)

	if strings.Contains(s, "-----BEGIN") {
		block, _ := pem.Decode([]byte(s))
		if block == nil {
			return nil, errors.New("解析 ed25519 公钥失败: PEM 格式非法")
		}
		key, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("解析 ed25519 公钥失败: %w", err)
		}
		pub, ok := key.(ed25519.PublicKey)
		if !ok {
			return nil, fmt.Errorf("公钥类型不是 ed25519（实际 %T）", key)
		}
		return pub, nil
	}

	// 允许无 padding 的 base64（配置里手抄常见）。
	var decoded []byte
	var err error
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		decoded, err = enc.DecodeString(s)
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("解析 ed25519 公钥失败: %w", err)
	}
	if len(decoded) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("ed25519 公钥长度应为 %d 字节，实际 %d", ed25519.PublicKeySize, len(decoded))
	}
	return ed25519.PublicKey(decoded), nil
}

// ParsePrivateKey 供发布工具使用：支持裸 base64（seed 32 或 64 字节）与 PEM(PKCS8)。
func ParsePrivateKey(raw string) (ed25519.PrivateKey, error) {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "ed25519:")
	if strings.Contains(s, "-----BEGIN") {
		block, _ := pem.Decode([]byte(s))
		if block == nil {
			return nil, errors.New("解析 ed25519 私钥失败: PEM 格式非法")
		}
		if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
			if priv, ok := key.(ed25519.PrivateKey); ok {
				return priv, nil
			}
			return nil, fmt.Errorf("私钥类型不是 ed25519（实际 %T）", key)
		}
		// openssl 也可能输出 PKCS#8 的 "PRIVATE KEY"，这里再试一次原始 32 字节 seed。
		if len(block.Bytes) == ed25519.SeedSize {
			return ed25519.NewKeyFromSeed(block.Bytes), nil
		}
		return nil, errors.New("解析 ed25519 私钥失败: 不支持的 PEM 结构")
	}

	var decoded []byte
	var err error
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		decoded, err = enc.DecodeString(s)
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("解析 ed25519 私钥失败: %w", err)
	}
	switch len(decoded) {
	case ed25519.SeedSize:
		return ed25519.NewKeyFromSeed(decoded), nil
	case ed25519.PrivateKeySize:
		return ed25519.PrivateKey(decoded), nil
	default:
		return nil, fmt.Errorf("ed25519 私钥长度应为 %d 或 %d 字节，实际 %d",
			ed25519.SeedSize, ed25519.PrivateKeySize, len(decoded))
	}
}

func decodeSignature(sigB64 string) ([]byte, error) {
	s := strings.TrimSpace(sigB64)
	if s == "" {
		return nil, ErrSignatureRequired
	}
	var decoded []byte
	var err error
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		decoded, err = enc.DecodeString(s)
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("%w: base64 解码失败: %v", ErrSignatureInvalid, err)
	}
	if len(decoded) != ed25519.SignatureSize {
		return nil, fmt.Errorf("%w: 签名长度应为 %d 字节，实际 %d", ErrSignatureInvalid, ed25519.SignatureSize, len(decoded))
	}
	return decoded, nil
}
