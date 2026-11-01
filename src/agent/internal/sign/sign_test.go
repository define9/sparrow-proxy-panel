package sign

import (
	"testing"
	"time"
)

// 向量来自 docs/architecture/agent-sign-vectors.md（用独立 Python 实现复核过）。
const vectorSecret = "sparrow-test-secret"

func TestSignVectors(t *testing.T) {
	const ts = int64(1767225600000)
	tsTime := time.UnixMilli(ts)

	cases := []struct {
		name     string
		method   string
		path     string
		nonce    string
		body     string
		wantHash string
		wantSig  string
	}{
		{
			name:     "GET 空 body",
			method:   "GET",
			path:     "/api/v1/agent/config",
			nonce:    "a1b2c3d4e5f6a7b8",
			body:     "",
			wantHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			wantSig:  "91763bac5cb712a255c639ae593a5ef49dda36104ffee7de8bb23aea44522ad4",
		},
		{
			name:     "POST heartbeat",
			method:   "POST",
			path:     "/api/v1/agent/heartbeat",
			nonce:    "0011223344556677",
			body:     `{"status":"online","cpu":12.5,"memory":43.1,"onlineUsers":37}`,
			wantHash: "394d8ca6b26cfadf9b77c19736eab7e0734a222165a3b602d3e41d2f5187e147",
			wantSig:  "58074d69adef4440434e1bbf4dbf51244038cd8bba166a13d13141030cda4223",
		},
		{
			name:     "POST traffic",
			method:   "POST",
			path:     "/api/v1/agent/traffic",
			nonce:    "ffeeddccbbaa9988",
			body:     `{"seq":1024,"items":[{"uid":1001,"upload":1048576,"download":10485760}]}`,
			wantHash: "d1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f",
			wantSig:  "a49b6c068b3790f11c0c70001443fb59a1b86c8185ac25e56d1c24671bcc4509",
		},
		{
			name:     "POST traffic 非 ASCII body",
			method:   "POST",
			path:     "/api/v1/agent/traffic",
			nonce:    "9f8e7d6c5b4a3928",
			body:     `{"items":[{"uid":1001,"note":"流量"}]}`,
			wantHash: "032ce7cb6c6f20327bbb73f979e48e7d908e62a29108d7d77283001f0b3c7c82",
			wantSig:  "f5fe60f072e309fcb50a7a0b8a6c4af0223a8cacf44e3eeae702a2ea2ecfbd12",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := HashHex([]byte(c.body)); got != c.wantHash {
				t.Fatalf("sha256(body) = %s, want %s", got, c.wantHash)
			}

			headers := Headers(c.method, c.path, vectorSecret, c.body, tsTime, c.nonce)
			if headers["X-Timestamp"] != "1767225600000" {
				t.Fatalf("timestamp header = %s", headers["X-Timestamp"])
			}
			if headers["X-Signature"] != c.wantSig {
				t.Fatalf("signature = %s, want %s", headers["X-Signature"], c.wantSig)
			}
		})
	}
}

func TestNonceUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		n, err := Nonce()
		if err != nil {
			t.Fatal(err)
		}
		if len(n) != 32 {
			t.Fatalf("nonce 长度应为 32，得到 %d", len(n))
		}
		if seen[n] {
			t.Fatal("nonce 重复")
		}
		seen[n] = true
	}
}
