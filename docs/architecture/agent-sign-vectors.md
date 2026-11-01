# Agent HMAC 签名向量（Go Agent 对齐用）

面板侧实现：`src/panel/lib/agent/sign.ts`，向量测试：`src/panel/lib/agent/sign.test.ts`。

```sh
cd src/panel && pnpm test:sign
```

## canonical

```
METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
```

- `METHOD`：大写（GET/POST）
- `PATH`：`URL.pathname`，不含 query 与 origin
- `TIMESTAMP`：Unix 毫秒的十进制字符串
- `NONCE`：16 字节随机值（hex 或 uuid 去横线均可，长度 8–128）
- `SHA256(body)`：原始字节的 sha256，小写 hex；GET/空 body 用 `sha256("")`
- `signature = hex(HMAC-SHA256(secret, canonical))`，secret 为 `nodeSecret` 原文

请求头：`X-Node-Id` / `X-Timestamp` / `X-Nonce` / `X-Signature`。

校验：时间偏差 ≤ 5 分钟；nonce 10 分钟内不可重复；`crypto.timingSafeEqual` 常量时间比较。
错误码：`AGENT_SIGN_INVALID`、`AGENT_TIMESTAMP_SKEW`、`AGENT_NONCE_REUSED`、`AGENT_NOT_REGISTERED`。

## 固定向量

secret：`sparrow-test-secret`，timestamp：`1767225600000`。

| # | METHOD | PATH | NONCE | body |
|---|---|---|---|---|
| 1 | GET | `/api/v1/agent/config` | `a1b2c3d4e5f6a7b8` | （空） |
| 2 | POST | `/api/v1/agent/heartbeat` | `0011223344556677` | `{"status":"online","cpu":12.5,"memory":43.1,"onlineUsers":37}` |
| 3 | POST | `/api/v1/agent/traffic` | `ffeeddccbbaa9988` | `{"seq":1024,"items":[{"uid":1001,"upload":1048576,"download":10485760}]}` |
| 4 | POST | `/api/v1/agent/traffic` | `9f8e7d6c5b4a3928` | `{"items":[{"uid":1001,"note":"流量"}]}` |

期望值：

| # | SHA256(body) | signature |
|---|---|---|
| 1 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `91763bac5cb712a255c639ae593a5ef49dda36104ffee7de8bb23aea44522ad4` |
| 2 | `394d8ca6b26cfadf9b77c19736eab7e0734a222165a3b602d3e41d2f5187e147` | `58074d69adef4440434e1bbf4dbf51244038cd8bba166a13d13141030cda4223` |
| 3 | `d1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f` | `a49b6c068b3790f11c0c70001443fb59a1b86c8185ac25e56d1c24671bcc4509` |
| 4 | `032ce7cb6c6f20327bbb73f979e48e7d908e62a29108d7d77283001f0b3c7c82` | `f5fe60f072e309fcb50a7a0b8a6c4af0223a8cacf44e3eeae702a2ea2ecfbd12` |

向量 1 的 canonical：

```
GET
/api/v1/agent/config
1767225600000
a1b2c3d4e5f6a7b8
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

期望值用独立的 Python 实现复核过（`hmac.new(secret, canonical, sha256).hexdigest()`），不是从 TS 实现里抄的。

## 节点密钥存储

`nodes.agent_secret_hash` 存的是版本化复合值：

```
v1$<sha256(secret)>$<iv>$<tag>$<aes-256-gcm(secret)>
```

- `sha256(secret)` 用于比对，密文用 `MASTER_KEY` 派生密钥加密，落库不出现明文
- HMAC 验签需要原始 secret，因此只存裸 sha256 无法验签（历史行会被拒绝，需重新注册）
- `nodeSecret` 明文只在 `/agent/register` 响应里返回一次
