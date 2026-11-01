import 'server-only'
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { parseJson } from '@/lib/api/admin-ops'
import { db } from '@/lib/db'
import { agentEvents, auditLogs, loginLogs, nodes, pluginJobRuns, pluginJobs, taskRuns } from '@/lib/db/schema'

/**
 * 管理端日志服务层：审计 / 登录 / 任务 / 节点事件四类日志统一分页出口。
 * route 只传 kind + 筛选条件，返回结构统一为 { data, total }。
 */

export type LogKind = 'audit' | 'login' | 'tasks' | 'agent'
export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'audit' | 'login' | 'task' | 'agent'

export interface LogEntryDto {
  id: string
  category: LogCategory
  level: LogLevel
  actor: string
  action: string
  target: string
  ip: string | null
  message: string
  createdAt: string
  payload: Record<string, unknown>
}

export interface LogFilters {
  /** 关键词（审计/登录/节点事件为 SQL 模糊匹配，任务日志为内存过滤） */
  q?: string
  /** 级别筛选，'all' 或空表示不筛 */
  level?: string
  /** 时间范围（小时），非正数表示不限 */
  range?: string | number
}

export interface LogPageQuery extends LogFilters {
  page: number
  pageSize: number
  offset: number
}

export interface LogListResult {
  data: LogEntryDto[]
  total: number
}

function hoursOf(range: string | number | undefined): number {
  if (typeof range === 'number') return range
  return Number(range) || 0
}

function sinceOf(hours: number): Date | null {
  return hours > 0 ? new Date(Date.now() - hours * 3_600_000) : null
}

/* -------------------------------- 审计日志 -------------------------------- */

async function listAuditLogs(filters: LogPageQuery): Promise<LogListResult> {
  const q = filters.q?.trim() ?? ''
  const level = filters.level?.trim() ?? ''
  const hours = hoursOf(filters.range)

  const conditions = []
  if (level && level !== 'all') {
    conditions.push(eq(auditLogs.level, level as LogLevel))
  }
  if (hours > 0) {
    conditions.push(gte(auditLogs.createdAt, sinceOf(hours) as Date))
  }
  if (q) {
    conditions.push(
      or(
        ilike(auditLogs.actorLabel, `%${q}%`),
        ilike(auditLogs.action, `%${q}%`),
        ilike(auditLogs.message, `%${q}%`),
        ilike(auditLogs.targetId, `%${q}%`)
      )
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(auditLogs).where(where)

  return {
    data: rows.map((row) => {
      const meta = parseJson<Record<string, unknown>>(row.meta)
      return {
        id: row.id,
        category: 'audit' as const,
        level: row.level as LogLevel,
        actor: row.actorLabel ?? row.actorId ?? row.actorType,
        action: row.action,
        target: row.targetId ? `${row.targetType ?? 'target'}:${row.targetId}` : (row.targetType ?? ''),
        ip: row.ip,
        message: row.message ?? '',
        createdAt: row.createdAt.toISOString(),
        payload: {
          actorType: row.actorType,
          actorId: row.actorId,
          actorLabel: row.actorLabel,
          targetType: row.targetType,
          targetId: row.targetId,
          ...(meta ? { meta } : {})
        }
      }
    }),
    total: Number(countRow?.total ?? 0)
  }
}

/* -------------------------------- 登录日志 -------------------------------- */

async function listLoginLogs(filters: LogPageQuery): Promise<LogListResult> {
  const q = filters.q?.trim() ?? ''
  const level = filters.level?.trim() ?? ''
  const hours = hoursOf(filters.range)

  const conditions = []
  if (level === 'info') conditions.push(eq(loginLogs.success, true))
  if (level === 'warn' || level === 'error') conditions.push(eq(loginLogs.success, false))
  if (hours > 0) {
    conditions.push(gte(loginLogs.createdAt, sinceOf(hours) as Date))
  }
  if (q) {
    conditions.push(
      or(
        ilike(loginLogs.email, `%${q}%`),
        ilike(loginLogs.ip, `%${q}%`),
        ilike(loginLogs.reason, `%${q}%`),
        ilike(loginLogs.userAgent, `%${q}%`)
      )
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select()
    .from(loginLogs)
    .where(where)
    .orderBy(desc(loginLogs.createdAt))
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(loginLogs).where(where)

  return {
    data: rows.map((row) => ({
      id: row.id,
      category: 'login' as const,
      level: (row.success ? 'info' : 'warn') as LogLevel,
      actor: row.email ?? 'unknown',
      action: row.success ? 'auth.login' : 'auth.login.failed',
      target: 'session',
      ip: row.ip,
      message: row.success ? '登录成功' : `登录失败：${row.reason ?? '未知原因'}`,
      createdAt: row.createdAt.toISOString(),
      payload: {
        userId: row.userId,
        success: row.success,
        reason: row.reason,
        userAgent: row.userAgent,
        ip: row.ip
      }
    })),
    total: Number(countRow?.total ?? 0)
  }
}

/* -------------------------------- 任务日志 -------------------------------- */

const JOB_LEVEL: Record<string, LogLevel> = {
  ok: 'info',
  running: 'info',
  skipped: 'warn',
  failed: 'error',
  timeout: 'error'
}

/**
 * 任务日志来自两张表：task_runs（内置任务）与 plugin_job_runs（插件作业）。
 * 两边各取最近 500 条，合并后在内存里按级别/时间/关键词过滤再分页。
 */
async function listTaskLogs(filters: LogPageQuery): Promise<LogListResult> {
  const q = filters.q?.trim().toLowerCase() ?? ''
  const level = filters.level?.trim() ?? ''
  const since = sinceOf(hoursOf(filters.range))

  const taskRows = await db.select().from(taskRuns).orderBy(desc(taskRuns.startedAt)).limit(500)
  const jobRows = await db
    .select({
      run: pluginJobRuns,
      pluginKey: pluginJobs.pluginKey,
      jobKey: pluginJobs.jobKey,
      cron: pluginJobs.cron
    })
    .from(pluginJobRuns)
    .innerJoin(pluginJobs, eq(pluginJobs.id, pluginJobRuns.jobId))
    .orderBy(desc(pluginJobRuns.startedAt))
    .limit(500)

  const items: LogEntryDto[] = [
    ...taskRows.map(
      (row): LogEntryDto => ({
        id: row.id,
        category: 'task',
        level: row.status === 'failed' ? 'error' : 'info',
        actor: 'system',
        action: `task.${row.name}`,
        target: row.name,
        ip: null,
        message: row.error ? `${row.name}：${row.error}` : `${row.name} ${row.status}`,
        createdAt: row.startedAt.toISOString(),
        payload: {
          status: row.status,
          startedAt: row.startedAt.toISOString(),
          finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
          error: row.error,
          meta: parseJson<Record<string, unknown>>(row.meta)
        }
      })
    ),
    ...jobRows.map(({ run, pluginKey, jobKey, cron }): LogEntryDto => {
      const target = `${pluginKey}/${jobKey}`
      return {
        id: run.id,
        category: 'task',
        level: JOB_LEVEL[run.status] ?? 'info',
        actor: 'system',
        action: 'job.run',
        target,
        ip: null,
        message: run.error
          ? `${target} 执行失败：${run.error}`
          : `${target} ${run.status}${run.durationMs ? `（${run.durationMs}ms）` : ''}`,
        createdAt: run.startedAt.toISOString(),
        payload: {
          runId: run.runId,
          status: run.status,
          cron,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
          durationMs: run.durationMs,
          error: run.error,
          result: parseJson<unknown>(run.result)
        }
      }
    })
  ]

  const filtered = items
    .filter((item) => (since ? new Date(item.createdAt) >= since : true))
    .filter((item) => (level && level !== 'all' ? item.level === level : true))
    .filter((item) =>
      q ? [item.actor, item.action, item.target, item.message].join(' ').toLowerCase().includes(q) : true
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  return {
    data: filtered.slice(filters.offset, filters.offset + filters.pageSize),
    total: filtered.length
  }
}

/* ------------------------------ 节点事件日志 ------------------------------ */

async function listAgentLogs(filters: LogPageQuery): Promise<LogListResult> {
  const q = filters.q?.trim() ?? ''
  const level = filters.level?.trim() ?? ''
  const hours = hoursOf(filters.range)

  const conditions = []
  if (level && level !== 'all') conditions.push(eq(agentEvents.level, level as LogLevel))
  if (hours > 0) {
    conditions.push(gte(agentEvents.createdAt, sinceOf(hours) as Date))
  }
  if (q) {
    conditions.push(
      or(
        ilike(nodes.name, `%${q}%`),
        ilike(agentEvents.type, `%${q}%`),
        ilike(agentEvents.message, `%${q}%`)
      )
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({ event: agentEvents, nodeName: nodes.name })
    .from(agentEvents)
    .leftJoin(nodes, eq(nodes.id, agentEvents.nodeId))
    .where(where)
    .orderBy(desc(agentEvents.createdAt))
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db
    .select({ total: sql<string>`count(*)` })
    .from(agentEvents)
    .leftJoin(nodes, eq(nodes.id, agentEvents.nodeId))
    .where(where)

  return {
    data: rows.map(({ event, nodeName }) => ({
      id: event.id,
      category: 'agent' as const,
      level: (['info', 'warn', 'error'].includes(event.level) ? event.level : 'info') as LogLevel,
      actor: nodeName ? `agent:${nodeName}` : `agent:${event.nodeId}`,
      action: event.type,
      target: nodeName ?? event.nodeId,
      ip: null,
      message: event.message ?? event.type,
      createdAt: event.createdAt.toISOString(),
      payload: {
        nodeId: event.nodeId,
        nodeName,
        type: event.type,
        ...(parseJson<Record<string, unknown>>(event.payload) ?? {})
      }
    })),
    total: Number(countRow?.total ?? 0)
  }
}

const HANDLERS: Record<LogKind, (filters: LogPageQuery) => Promise<LogListResult>> = {
  audit: listAuditLogs,
  login: listLoginLogs,
  tasks: listTaskLogs,
  agent: listAgentLogs
}

/** 管理端日志统一入口：kind 决定数据源，分页/筛选口径一致 */
export async function listLogs(kind: LogKind, filters: LogPageQuery): Promise<LogListResult> {
  return HANDLERS[kind](filters)
}
