package sign

import (
	"encoding/hex"
	"strings"
	"testing"
)

// 契约测试向量（与面板端 src/panel 共用同一组）。
//
// canonical = METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
//   - METHOD 大写
//   - PATH 请求路径（含前导 "/"，不含查询串）
//   - TIMESTAMP Unix 毫秒时间戳字符串
//   - NONCE 随机串（16 字节随机数的十六进制）
//   - SHA256(body) 请求体的十六进制摘要（小写）；body 为空时用空串的 SHA-256
//
// 这些向量由独立实现（Python 的 hmac/hashlib）生成，避免「自己验自己」。
type testVector struct {
	name      string
	method    string
	path      string
	secret    string
	timestamp string
	nonce     string
	body      string
	canonical string
	signature string
}

// testVectors 是面板与 Agent 共享的固定测试向量。
var testVectors = []testVector{
	{
		name:      "心跳（带 JSON body）",
		method:    "POST",
		path:      "/api/v1/agent/heartbeat",
		secret:    "unit-test-key-01",
		timestamp: "1761264000000",
		nonce:     "0123456789abcdef0123456789abcdef",
		body:      `{"status":"online","netRx":1024000,"netTx":2048000,"agentVersion":"1.0.0","reportedAt":"2026-10-24T08:00:00.000Z"}`,
		canonical: "POST\n/api/v1/agent/heartbeat\n1761264000000\n0123456789abcdef0123456789abcdef\n5fe0650565b951068f8c8209f16bdec5aa7f7ce5e5a73c6016abf13a2b49e4c8",
		signature: "ab120e50f708b2ca498ae9578e3e686af83d70ceb3a8b9ca074c85fc83f62150",
	},
	{
		name:      "拉取配置（GET，空 body）",
		method:    "GET",
		path:      "/api/v1/agent/config",
		secret:    "unit-test-key-01",
		timestamp: "1761264000123",
		nonce:     "fedcba9876543210fedcba9876543210",
		body:      "",
		canonical: "GET\n/api/v1/agent/config\n1761264000123\nfedcba9876543210fedcba9876543210\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		signature: "b825af54702e4316b271b384da63142b779e4d4d6e23905bcd60d90397287e04",
	},
	{
		name:      "上报流量（带 JSON body）",
		method:    "POST",
		path:      "/api/v1/agent/traffic",
		secret:    "unit-test-key-01",
		timestamp: "1761264000456",
		nonce:     "a1b2c3d4e5f60718293a4b5c6d7e8f90",
		body:      `{"seq":1024,"items":[{"uid":1001,"upload":1048576,"download":10485760}]}`,
		canonical: "POST\n/api/v1/agent/traffic\n1761264000456\na1b2c3d4e5f60718293a4b5c6d7e8f90\nd1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f",
		signature: "aead0d567f87540b33194ccbb7fe483a6d2b4f0a1caa85b1a4668944093e823a",
	},
	{
		name:      "命令回执（另一个节点密钥）",
		method:    "POST",
		path:      "/api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack",
		secret:    "unit-test-key-02",
		timestamp: "1761264000789",
		nonce:     "00112233445566778899aabbccddeeff",
		body:      `{"status":"success","result":{"version":42}}`,
		canonical: "POST\n/api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack\n1761264000789\n00112233445566778899aabbccddeeff\neaa741c84539b243de843ff8f1b5577d7c43429d0a636d22df0ce61e2794a02c",
		signature: "c7853b08ace85abb4743193d03369bafcdcdf20d7358b5050c294d3b0928bcd1",
	},
}

// TestCanonicalMatchesFixedVectors 校验 canonical 字符串与固定向量逐字节一致。
func TestCanonicalMatchesFixedVectors(t *testing.T) {
	for _, v := range testVectors {
		t.Run(v.name, func(t *testing.T) {
			got := Canonical(v.method, v.path, v.timestamp, v.nonce, []byte(v.body))
			if got != v.canonical {
				t.Fatalf("canonical 不一致\n期望: %q\n实际: %q", v.canonical, got)
			}
			// canonical 必须是 4 个 LF 分隔、且结尾没有换行
			if strings.HasSuffix(got, "\n") {
				t.Fatal("canonical 不应以换行结尾")
			}
			if parts := strings.Split(got, "\n"); len(parts) != 5 {
				t.Fatalf("canonical 应为 5 段，实际 %d 段", len(parts))
			}
		})
	}
}

// TestSignMatchesFixedVectors 校验签名与固定向量一致。
func TestSignMatchesFixedVectors(t *testing.T) {
	for _, v := range testVectors {
		t.Run(v.name, func(t *testing.T) {
			got := Sign(v.secret, v.method, v.path, v.timestamp, v.nonce, []byte(v.body))
			if got != v.signature {
				t.Fatalf("签名不一致\n期望: %s\n实际: %s", v.signature, got)
			}
		})
	}
}

// TestVerifyAcceptsFixedVectors 校验 Verify 能接受固定向量。
func TestVerifyAcceptsFixedVectors(t *testing.T) {
	for _, v := range testVectors {
		t.Run(v.name, func(t *testing.T) {
			if !Verify(v.secret, v.method, v.path, v.timestamp, v.nonce, []byte(v.body), v.signature) {
				t.Fatal("合法签名校验失败")
			}
			if Verify(v.secret, v.method, v.path, v.timestamp, v.nonce, []byte(v.body), strings.ToUpper(v.signature)) {
				t.Fatal("大写签名不应通过校验（签名必须是十六进制小写）")
			}
		})
	}
}

// TestVerifyRejectsTampered 校验任何篡改都会导致校验失败。
func TestVerifyRejectsTampered(t *testing.T) {
	v := testVectors[0]
	cases := []struct {
		name      string
		method    string
		path      string
		timestamp string
		nonce     string
		body      string
		secret    string
	}{
		{"方法被改", "GET", v.path, v.timestamp, v.nonce, v.body, v.secret},
		{"路径被改", v.method, "/api/v1/agent/config", v.timestamp, v.nonce, v.body, v.secret},
		{"时间戳被改", v.method, v.path, "1761264000001", v.nonce, v.body, v.secret},
		{"nonce 被改", v.method, v.path, v.timestamp, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", v.body, v.secret},
		{"body 被改", v.method, v.path, v.timestamp, v.nonce, v.body + " ", v.secret},
		{"密钥被改", v.method, v.path, v.timestamp, v.nonce, v.body, "another-key"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if Verify(c.secret, c.method, c.path, c.timestamp, c.nonce, []byte(c.body), v.signature) {
				t.Fatal("被篡改的请求不应通过校验")
			}
		})
	}
}

// TestBodyHashEmpty 校验空请求体的摘要。
func TestBodyHashEmpty(t *testing.T) {
	if got := BodyHash(nil); got != EmptyBodyHash {
		t.Fatalf("空 body 摘要不一致: %s", got)
	}
	if got := BodyHash([]byte{}); got != EmptyBodyHash {
		t.Fatalf("空 body 摘要不一致: %s", got)
	}
}

// TestSignHeadersWith 校验带固定时间戳与 nonce 的请求头生成。
func TestSignHeadersWith(t *testing.T) {
	v := testVectors[2]
	headers := SignHeadersWith("node-1", v.secret, v.method, v.path, v.timestamp, v.nonce, []byte(v.body))
	if headers.Timestamp != v.timestamp {
		t.Fatalf("时间戳不一致: %s", headers.Timestamp)
	}
	if headers.Nonce != v.nonce {
		t.Fatalf("nonce 不一致: %s", headers.Nonce)
	}
	if headers.Signature != v.signature {
		t.Fatalf("签名不一致: %s", headers.Signature)
	}
	if headers.NodeID != "node-1" {
		t.Fatalf("节点 ID 不一致: %s", headers.NodeID)
	}
}

// TestNonceUniqueness 校验 nonce 随机且长度固定。
func TestNonceUniqueness(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		nonce, err := Nonce()
		if err != nil {
			t.Fatalf("生成 nonce 失败: %v", err)
		}
		if len(nonce) != 32 {
			t.Fatalf("nonce 长度应为 32，实际 %d", len(nonce))
		}
		if _, err := hex.DecodeString(nonce); err != nil {
			t.Fatalf("nonce 不是合法十六进制: %v", err)
		}
		if seen[nonce] {
			t.Fatal("nonce 出现重复")
		}
		seen[nonce] = true
	}
}

// TestVerifyRejectsInvalidHex 校验非法十六进制签名一律失败。
func TestVerifyRejectsInvalidHex(t *testing.T) {
	v := testVectors[0]
	if Verify(v.secret, v.method, v.path, v.timestamp, v.nonce, []byte(v.body), "not-hex") {
		t.Fatal("非法十六进制签名不应通过校验")
	}
}
