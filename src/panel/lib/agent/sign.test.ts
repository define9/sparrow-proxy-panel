import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import {
  buildCanonicalString,
  consumeNonce,
  resetNonceStore,
  safeEqualHex,
  SHA256_EMPTY_BODY,
  signRequest
} from './sign'

/**
 * 固定测试向量（供 Go Agent 对齐）。
 *
 * secret = "sparrow-test-secret"
 * canonical = METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)
 * signature = hex(HMAC-SHA256(secret, canonical))
 *
 * 期望值用独立的 Python 实现算过一遍，不是从本实现的输出里抄的：
 *   hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
 *
 * 运行：pnpm --filter panel exec tsx lib/agent/sign.test.ts
 */

const SECRET = 'sparrow-test-secret'
const TIMESTAMP = '1767225600000'

interface Vector {
  name: string
  method: string
  path: string
  nonce: string
  body: string
  bodySha256: string
  signature: string
}

const VECTORS: Vector[] = [
  {
    name: 'GET 空 body',
    method: 'GET',
    path: '/api/v1/agent/config',
    nonce: 'a1b2c3d4e5f6a7b8',
    body: '',
    bodySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature: '91763bac5cb712a255c639ae593a5ef49dda36104ffee7de8bb23aea44522ad4'
  },
  {
    name: 'POST heartbeat',
    method: 'POST',
    path: '/api/v1/agent/heartbeat',
    nonce: '0011223344556677',
    body: '{"status":"online","cpu":12.5,"memory":43.1,"onlineUsers":37}',
    bodySha256: '394d8ca6b26cfadf9b77c19736eab7e0734a222165a3b602d3e41d2f5187e147',
    signature: '58074d69adef4440434e1bbf4dbf51244038cd8bba166a13d13141030cda4223'
  },
  {
    name: 'POST traffic',
    method: 'POST',
    path: '/api/v1/agent/traffic',
    nonce: 'ffeeddccbbaa9988',
    body: '{"seq":1024,"items":[{"uid":1001,"upload":1048576,"download":10485760}]}',
    bodySha256: 'd1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f',
    signature: 'a49b6c068b3790f11c0c70001443fb59a1b86c8185ac25e56d1c24671bcc4509'
  },
  {
    name: 'POST traffic（非 ASCII body，验证按字节 sha256）',
    method: 'POST',
    path: '/api/v1/agent/traffic',
    nonce: '9f8e7d6c5b4a3928',
    body: '{"items":[{"uid":1001,"note":"流量"}]}',
    bodySha256: '032ce7cb6c6f20327bbb73f979e48e7d908e62a29108d7d77283001f0b3c7c82',
    signature: 'f5fe60f072e309fcb50a7a0b8a6c4af0223a8cacf44e3eeae702a2ea2ecfbd12'
  }
]

let failed = 0

for (const vector of VECTORS) {
  const input = {
    method: vector.method,
    path: vector.path,
    timestamp: TIMESTAMP,
    nonce: vector.nonce,
    body: vector.body
  }
  const canonical = buildCanonicalString(input)
  const expectedCanonical = [
    vector.method,
    vector.path,
    TIMESTAMP,
    vector.nonce,
    vector.bodySha256
  ].join('\n')

  try {
    assert.equal(canonical, expectedCanonical, `canonical 不一致：${vector.name}`)
    // 独立校验一遍 body 的 sha256（hex 小写）
    const independentBodyHash = createHash('sha256').update(vector.body, 'utf8').digest('hex')
    assert.equal(independentBodyHash, vector.bodySha256, `body sha256 不一致：${vector.name}`)

    const signature = signRequest(SECRET, input)
    assert.equal(signature, vector.signature, `签名不一致：${vector.name}`)

    // 反向验证：用 HMAC 独立重算一次
    const independent = createHmac('sha256', SECRET).update(canonical, 'utf8').digest('hex')
    assert.equal(independent, vector.signature, `独立 HMAC 不一致：${vector.name}`)

    console.log(`✓ ${vector.name}: ${signature}`)
  } catch (error) {
    failed += 1
    console.error(`✗ ${vector.name}:`, (error as Error).message)
  }
}

// 常量时间比较
assert.equal(safeEqualHex('abcd', 'abcd'), true, 'safeEqualHex 相等应返回 true')
assert.equal(safeEqualHex('abcd', 'abce'), false, 'safeEqualHex 不等应返回 false')
assert.equal(safeEqualHex('abcd', 'abcde'), false, '长度不同应返回 false')
console.log('✓ safeEqualHex')

// nonce 重放：首次 true，10 分钟内重复 false
resetNonceStore()
assert.equal(consumeNonce('node:nonce-1'), true, '首次 nonce 应通过')
assert.equal(consumeNonce('node:nonce-1'), false, '重复 nonce 应被拒绝')
console.log('✓ nonce 去重')

// 空 body 的 sha256 常量
assert.equal(SHA256_EMPTY_BODY, VECTORS[0].bodySha256, '空 body sha256 常量不一致')
console.log('✓ 空 body sha256 常量')

if (failed > 0) {
  console.error(`\n${failed} / ${VECTORS.length} 组签名向量失败`)
  process.exit(1)
}

console.log('\n全部签名向量通过（4 组）')
