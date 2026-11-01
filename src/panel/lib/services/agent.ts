import 'server-only'
import type { z } from 'zod'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  agentCommands,
  agentEvents,
  nodeHeartbeats,
  nodes,
  subscriptions,
  trafficLogs
} from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import type { agentHeartbeatSchema, agentRegisterSchema, agentTrafficSchema } from '@/lib/api/node-schemas'
import { MIN_AGENT_VERSION, resolveUids } from '@/lib/agent/config'
import { generateNodeSecret, sealSecret } from '@/lib/agent/secret'
import { getMaxSeq, rememberSeq } from '@/lib/agent/traffic'

/**
 * Agent 协议服务层：注册 / 心跳 / 流量上报。
 *
 * 验签留在 lib/agent/auth.ts（route 里调用后把 nodeId 传进来），
 * 这里只负责落库与组装返回体，不碰 Request / 响应状态码。
 */

export const AGENT_HEARTBEAT_INTERVAL = 30
export const AGENT_CONFIG_POLL_INTERVAL = 300

export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>
export type AgentTrafficInput = z.infer<typeof agentTrafficSchema>

export interface AgentRegisterResult {
  nodeId: string
  nodeSecret: string
  heartbeatInterval: number
  configPollInterval: number
}

export interface AgentHeartbeatResult {
  ack: true
  configVersion: number
  minAgentVersion: string
}

export interface AgentTrafficResult {
  accepted: number
  seq: number
  duplicate?: true
}

/**
 * 首次注册：一次性 registration token 已在 route 里校验成 nodeId，
 * nodeSecret 明文只在这里返回一次，之后库里只有加密值 + sha256。
 */
export async function registerNode(
  nodeId: string,
  input: AgentRegisterInput
): Promise<AgentRegisterResult> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1)
  if (!node) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在或已被删除')

  const nodeSecret = generateNodeSecret()
  await db
    .update(nodes)
    .set({
      agentSecretHash: sealSecret(nodeSecret),
      agentVersion: input.agentVersion ?? node.agentVersion,
      status: 'online',
      lastSeenAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, nodeId))

  await db.insert(agentEvents).values({
    nodeId,
    type: 'register',
    level: 'info',
    message: `Agent ${input.agentVersion ?? 'unknown'} 注册成功（${input.hostname ?? input.ip ?? 'unknown'}）`,
    payload: JSON.stringify(input)
  })

  return {
    nodeId,
    nodeSecret,
    heartbeatInterval: AGENT_HEARTBEAT_INTERVAL,
    configPollInterval: AGENT_CONFIG_POLL_INTERVAL
  }
}

export async function recordHeartbeat(
  nodeId: string,
  input: AgentHeartbeatInput
): Promise<AgentHeartbeatResult> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1)
  if (!node) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  const agentVersion = input.agentVersion ?? node.agentVersion
  const reportedAt = input.reportedAt ? new Date(input.reportedAt) : new Date()
  const safeReportedAt = Number.isNaN(reportedAt.getTime()) ? new Date() : reportedAt

  await db
    .insert(nodeHeartbeats)
    .values({
      nodeId,
      status: input.status,
      cpu: input.cpu.toFixed(2),
      memory: input.memory.toFixed(2),
      disk: input.disk.toFixed(2),
      netRx: String(input.netRx),
      netTx: String(input.netTx),
      onlineUsers: input.onlineUsers,
      agentVersion,
      coreVersion: input.coreVersion ?? null,
      reportedAt: safeReportedAt
    })
    .onConflictDoUpdate({
      target: nodeHeartbeats.nodeId,
      set: {
        status: input.status,
        cpu: input.cpu.toFixed(2),
        memory: input.memory.toFixed(2),
        disk: input.disk.toFixed(2),
        netRx: String(input.netRx),
        netTx: String(input.netTx),
        onlineUsers: input.onlineUsers,
        agentVersion,
        coreVersion: input.coreVersion ?? null,
        reportedAt: safeReportedAt
      }
    })

  await db
    .update(nodes)
    .set({
      status: input.status,
      agentVersion,
      lastSeenAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, nodeId))

  return { ack: true, configVersion: node.configVersion, minAgentVersion: MIN_AGENT_VERSION }
}

export async function ingestTraffic(
  nodeId: string,
  input: AgentTrafficInput
): Promise<AgentTrafficResult> {
  const maxSeq = getMaxSeq(nodeId)
  if (input.seq <= maxSeq) {
    return { accepted: 0, seq: maxSeq, duplicate: true }
  }

  const items = input.items.filter((item) => item.upload > 0 || item.download > 0)
  const uidMap = await resolveUids(items.map((item) => item.uid))

  const logs = []
  for (const item of items) {
    const target = uidMap.get(item.uid)
    if (!target) continue
    logs.push({
      userId: target.userId,
      nodeId,
      upload: String(item.upload),
      download: String(item.download)
    })

    await db
      .update(subscriptions)
      .set({
        trafficUsed: sql`${subscriptions.trafficUsed} + ${item.upload + item.download}`,
        download: sql`${subscriptions.download} + ${item.download}`,
        upload: sql`${subscriptions.upload} + ${item.upload}`,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, target.subscriptionId))
  }

  if (logs.length > 0) {
    await db.insert(trafficLogs).values(logs)
  }

  rememberSeq(nodeId, input.seq)

  return { accepted: logs.length, seq: input.seq }
}

/* ---------------- 命令下发 ---------------- */

export interface AgentCommandDto {
  id: string
  command: string
  payload: unknown
  issuedAt: string
}

export interface AgentCommandAckInput {
  status: 'success' | 'failed'
  result?: unknown
}

/**
 * 拉取待执行命令（长轮询）。
 *
 * 单机部署下用 DB 轮询实现：pending → 立即返回；没有则按 wait 秒数轮询几次。
 * claimed 状态表示已经投递给 Agent，避免同一命令被重复下发。
 */
export async function listPendingCommands(
  nodeId: string,
  waitSeconds: number,
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<AgentCommandDto[]> {
  const deadline = Date.now() + Math.max(0, Math.min(waitSeconds, 25)) * 1000

  for (;;) {
    const rows = await db
      .select()
      .from(agentCommands)
      .where(and(eq(agentCommands.nodeId, nodeId), eq(agentCommands.status, 'pending')))
      .orderBy(agentCommands.issuedAt)
      .limit(20)

    if (rows.length > 0) {
      await db
        .update(agentCommands)
        .set({ status: 'acked', ackedAt: new Date() })
        .where(inArray(agentCommands.id, rows.map((row) => row.id)))

      return rows.map((row) => ({
        id: row.id,
        command: row.command,
        payload: row.payload ? safeParse(row.payload) : null,
        issuedAt: row.issuedAt.toISOString()
      }))
    }

    if (Date.now() >= deadline) return []
    await sleep(1000)
  }
}

/** 命令回执：done 或 failed，结果原样落库便于排查 */
export async function ackCommand(
  nodeId: string,
  commandId: string,
  input: AgentCommandAckInput
): Promise<{ ok: true }> {
  const [row] = await db
    .select()
    .from(agentCommands)
    .where(and(eq(agentCommands.id, commandId), eq(agentCommands.nodeId, nodeId)))
    .limit(1)

  if (!row) throw new ApiError(404, 'AGENT_COMMAND_NOT_FOUND', '命令不存在')

  await db
    .update(agentCommands)
    .set({
      status: input.status === 'success' ? 'done' : 'failed',
      finishedAt: new Date(),
      result: input.result === undefined ? null : JSON.stringify(input.result)
    })
    .where(eq(agentCommands.id, commandId))

  return { ok: true }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
