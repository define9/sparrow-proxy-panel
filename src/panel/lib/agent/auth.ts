import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodes } from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import { openSecret } from './secret'
import {
  consumeNonce,
  safeEqualHex,
  SIGN_WINDOW_MS,
  signRequest
} from './sign'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AgentNode = typeof nodes.$inferSelect

export interface AgentContext {
  node: AgentNode
  /** 原始请求体文本（验签用，handler 里自行 JSON.parse） */
  rawBody: string
}

function invalid(message: string) {
  return new ApiError(401, 'AGENT_SIGN_INVALID', message)
}

/**
 * 校验 Agent 签名并返回节点。
 *
 * 头：X-Node-Id / X-Timestamp / X-Nonce / X-Signature
 * 校验顺序：时间窗 → 查节点 → 验签 → nonce 去重（验签通过才消耗 nonce）
 */
export async function authenticateAgent(req: Request): Promise<AgentContext> {
  const nodeId = req.headers.get('x-node-id')
  const timestamp = req.headers.get('x-timestamp')
  const nonce = req.headers.get('x-nonce')
  const signature = req.headers.get('x-signature')

  if (!nodeId || !timestamp || !nonce || !signature) {
    throw invalid('缺少签名请求头')
  }
  if (!UUID_RE.test(nodeId)) throw invalid('X-Node-Id 不合法')

  const timestampMs = Number(timestamp)
  if (!Number.isFinite(timestampMs)) throw invalid('X-Timestamp 不合法')
  if (Math.abs(Date.now() - timestampMs) > SIGN_WINDOW_MS) {
    throw new ApiError(401, 'AGENT_TIMESTAMP_SKEW', '请求时间与服务器时间偏差超过 5 分钟')
  }
  if (nonce.length < 8 || nonce.length > 128) throw invalid('X-Nonce 长度不合法')

  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1)
  if (!node) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')
  if (!node.agentSecretHash) {
    throw new ApiError(401, 'AGENT_NOT_REGISTERED', '节点尚未注册，请先调用 /agent/register')
  }

  const secret = openSecret(node.agentSecretHash)
  if (!secret) throw invalid('节点密钥不可用，请重新注册')

  const method = req.method.toUpperCase()
  const rawBody = method === 'GET' || method === 'HEAD' ? '' : await req.text()
  const path = new URL(req.url).pathname

  const expected = signRequest(secret, { method, path, timestamp, nonce, body: rawBody })
  if (!safeEqualHex(expected, signature)) throw invalid('签名校验失败')

  if (!consumeNonce(`${node.id}:${nonce}`)) {
    throw new ApiError(401, 'AGENT_NONCE_REUSED', 'nonce 已使用，疑似重放请求')
  }

  return { node, rawBody }
}
