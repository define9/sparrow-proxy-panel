import { describe, expect, it } from 'vitest'
import {
  buildCanonicalString,
  buildSignature,
  createNonceStore,
  hashBody,
  normalizePath,
  SIGNATURE_MAX_SKEW_MS,
  SIGNATURE_NONCE_TTL_MS,
  verifySignature
} from '../../server/utils/node/signature'

/**
 * 节点 HMAC 签名固定测试向量（**面板 ↔ Agent 跨端共享**）。
 *
 * 这组向量由**独立实现**（Python `hmac` / `hashlib`）生成，
 * Go 侧 `internal/sign/sign_test.go` 逐字节断言同一组值，
 * 避免「自己验自己」。任何一侧改动都必须同步另一侧。
 *
 * canonical 需逐字节一致：
 *
 * ```
 * METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
 * ```
 *
 * - PATH 不含查询串
 * - TIMESTAMP 是 Unix **毫秒**
 * - NONCE / TIMESTAMP 用请求头里的**原始字符串**参与 canonical
 * - SHA256(body) 为请求体的 SHA-256 十六进制小写（空体为固定值）
 * - 签名 = HMAC-SHA256(secret, canonical) 的十六进制小写
 */
export interface SignatureTestVector {
  name: string
  secret: string
  method: string
  path: string
  timestamp: string
  nonce: string
  body: string
  /** SHA256(body) */
  bodyHash: string
  /** canonical 字符串（\n 为单个 LF） */
  canonical: string
  /** 期望签名 */
  signature: string
}

export const SIGNATURE_TEST_VECTORS: SignatureTestVector[] = [
  {
    name: '心跳（带 JSON body）',
    secret: 'unit-test-key-01',
    method: 'POST',
    path: '/api/v1/agent/heartbeat',
    timestamp: '1761264000000',
    nonce: '0123456789abcdef0123456789abcdef',
    body: '{"status":"online","netRx":1024000,"netTx":2048000,"agentVersion":"1.0.0","reportedAt":"2026-10-24T08:00:00.000Z"}',
    bodyHash: '5fe0650565b951068f8c8209f16bdec5aa7f7ce5e5a73c6016abf13a2b49e4c8',
    canonical: 'POST\n/api/v1/agent/heartbeat\n1761264000000\n0123456789abcdef0123456789abcdef\n5fe0650565b951068f8c8209f16bdec5aa7f7ce5e5a73c6016abf13a2b49e4c8',
    signature: 'ab120e50f708b2ca498ae9578e3e686af83d70ceb3a8b9ca074c85fc83f62150'
  },
  {
    name: '拉取配置（GET，空 body）',
    secret: 'unit-test-key-01',
    method: 'GET',
    path: '/api/v1/agent/config',
    timestamp: '1761264000123',
    nonce: 'fedcba9876543210fedcba9876543210',
    body: '',
    bodyHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    canonical: 'GET\n/api/v1/agent/config\n1761264000123\nfedcba9876543210fedcba9876543210\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature: 'b825af54702e4316b271b384da63142b779e4d4d6e23905bcd60d90397287e04'
  },
  {
    name: '上报流量（带 JSON body）',
    secret: 'unit-test-key-01',
    method: 'POST',
    path: '/api/v1/agent/traffic',
    timestamp: '1761264000456',
    nonce: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    body: '{"seq":1024,"items":[{"uid":1001,"upload":1048576,"download":10485760}]}',
    bodyHash: 'd1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f',
    canonical: 'POST\n/api/v1/agent/traffic\n1761264000456\na1b2c3d4e5f60718293a4b5c6d7e8f90\nd1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f',
    signature: 'aead0d567f87540b33194ccbb7fe483a6d2b4f0a1caa85b1a4668944093e823a'
  },
  {
    name: '命令回执（另一个节点密钥）',
    secret: 'unit-test-key-02',
    method: 'POST',
    path: '/api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack',
    timestamp: '1761264000789',
    nonce: '00112233445566778899aabbccddeeff',
    body: '{"status":"success","result":{"version":42}}',
    bodyHash: 'eaa741c84539b243de843ff8f1b5577d7c43429d0a636d22df0ce61e2794a02c',
    canonical: 'POST\n/api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack\n1761264000789\n00112233445566778899aabbccddeeff\neaa741c84539b243de843ff8f1b5577d7c43429d0a636d22df0ce61e2794a02c',
    signature: 'c7853b08ace85abb4743193d03369bafcdcdf20d7358b5050c294d3b0928bcd1'
  }
]

describe('signature · canonical 构造', () => {
  it('空请求体的 SHA256 是固定值', () => {
    expect(hashBody('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hashBody(undefined)).toBe(hashBody(''))
    expect(hashBody(null)).toBe(hashBody(''))
  })

  it('路径裁掉 query 与 fragment', () => {
    expect(normalizePath('/api/v1/agent/config?version=3')).toBe('/api/v1/agent/config')
    expect(normalizePath('/api/v1/agent/config#x')).toBe('/api/v1/agent/config')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('api/v1/agent/config')).toBe('/api/v1/agent/config')
  })

  it('canonical 严格为 METHOD \\n PATH \\n TIMESTAMP \\n NONCE \\n SHA256(body)', () => {
    const canonical = buildCanonicalString({
      method: 'post',
      path: '/api/v1/agent/heartbeat',
      timestamp: '1760000060000',
      nonce: 'ffeeddccbbaa9988',
      body: '{"status":"online"}'
    })

    expect(canonical.split('\n')).toHaveLength(5)
    expect(canonical).toBe(
      'POST\n/api/v1/agent/heartbeat\n1760000060000\nffeeddccbbaa9988\n89aab18cf5bc3c9d18086d537efe50cb29fb193c99aac895502cd0d95f630faa'
    )
  })
})

describe('signature · 固定测试向量', () => {
  it.each(SIGNATURE_TEST_VECTORS)('向量「$name」的 canonical 与签名一致', (vector) => {
    const canonical = buildCanonicalString({
      method: vector.method,
      path: vector.path,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      body: vector.body
    })

    expect(hashBody(vector.body)).toBe(vector.bodyHash)
    expect(canonical).toBe(vector.canonical)

    const signature = buildSignature({
      secret: vector.secret,
      method: vector.method,
      path: vector.path,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      body: vector.body
    })

    expect(signature).toBe(vector.signature)
  })

  it.each(SIGNATURE_TEST_VECTORS)('向量「$name」可以通过验签', (vector) => {
    const nonceStore = createNonceStore()

    const result = verifySignature({
      secret: vector.secret,
      method: vector.method,
      path: vector.path,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      signature: vector.signature,
      body: vector.body,
      now: Number(vector.timestamp),
      nonceStore
    })

    expect(result.ok).toBe(true)
  })
})

describe('signature · 验签规则', () => {
  const base = SIGNATURE_TEST_VECTORS[1]!

  it('时间偏差超过 5 分钟被拒绝', () => {
    const result = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: base.body,
      now: Number(base.timestamp) + SIGNATURE_MAX_SKEW_MS + 1,
      nonceStore: createNonceStore()
    })

    expect(result).toMatchObject({ ok: false, code: 'AGENT_TIMESTAMP_SKEW' })
  })

  it('时间偏差刚好 5 分钟仍然通过', () => {
    const result = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: base.body,
      now: Number(base.timestamp) + SIGNATURE_MAX_SKEW_MS,
      nonceStore: createNonceStore()
    })

    expect(result.ok).toBe(true)
  })

  it('请求体被篡改后验签失败', () => {
    const result = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: '{"status":"offline"}',
      now: Number(base.timestamp),
      nonceStore: createNonceStore()
    })

    expect(result).toMatchObject({ ok: false, code: 'AGENT_SIGN_INVALID' })
  })

  it('签名被篡改后验签失败', () => {
    const result = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: 'f'.repeat(64),
      body: base.body,
      now: Number(base.timestamp),
      nonceStore: createNonceStore()
    })

    expect(result).toMatchObject({ ok: false, code: 'AGENT_SIGN_INVALID' })
  })

  it('路径被篡改后验签失败', () => {
    const result = verifySignature({
      secret: base.secret,
      method: base.method,
      path: '/api/v1/agent/other',
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: base.body,
      now: Number(base.timestamp),
      nonceStore: createNonceStore()
    })

    expect(result).toMatchObject({ ok: false, code: 'AGENT_SIGN_INVALID' })
  })

  it('同一 nonce 第二次使用被判为重放', () => {
    const nonceStore = createNonceStore()

    const first = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: base.body,
      now: Number(base.timestamp),
      nonceStore
    })
    expect(first.ok).toBe(true)

    const second = verifySignature({
      secret: base.secret,
      method: base.method,
      path: base.path,
      timestamp: base.timestamp,
      nonce: base.nonce,
      signature: base.signature,
      body: base.body,
      now: Number(base.timestamp),
      nonceStore
    })
    expect(second).toMatchObject({ ok: false, code: 'AGENT_NONCE_REPLAY' })
  })

  it('nonce 过期后可以再次使用（TTL = 10 分钟）', () => {
    const nonceStore = createNonceStore()

    expect(nonceStore.remember('node-1:abc', 1_000)).toBe(true)
    expect(nonceStore.remember('node-1:abc', 1_000)).toBe(false)
    expect(nonceStore.remember('node-1:abc', 1_000 + SIGNATURE_NONCE_TTL_MS + 1)).toBe(true)
  })

  it('不同节点的同一 nonce 互不影响', () => {
    const nonceStore = createNonceStore()

    expect(nonceStore.remember('node-1:abc', 1_000)).toBe(true)
    expect(nonceStore.remember('node-2:abc', 1_000)).toBe(true)
  })
})
