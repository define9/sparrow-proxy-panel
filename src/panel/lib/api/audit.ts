import 'server-only'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'
import { clientIp } from '@/lib/api/response'

export type AuditLevel = 'info' | 'warn' | 'error'

export interface AuditActor {
  id?: string | null
  label?: string | null
  type?: 'user' | 'agent' | 'plugin' | 'system'
}

export interface AuditEntry {
  action: string
  targetType?: string | null
  targetId?: string | null
  message?: string | null
  level?: AuditLevel
  meta?: Record<string, unknown> | null
}

/** 操作者 + 请求环境：service 层拿不到 Request，由 route 把 IP 一起传下来 */
export interface AuditContext extends AuditActor {
  ip?: string | null
}

/**
 * 管理端写操作的统一审计出口。
 * 只记录「谁在什么 IP 对什么做了什么」，payload 一律转成文本存 meta 列。
 */
export async function writeAudit(actor: AuditContext, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    actorType: actor.type ?? 'user',
    actorId: actor.id ?? null,
    actorLabel: actor.label ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ip: actor.ip ?? null,
    level: entry.level ?? 'info',
    message: entry.message ?? null,
    meta: entry.meta ? JSON.stringify(entry.meta) : null
  })
}

/** Route Handler 便捷入口：从 Request 里取 IP 后转给 writeAudit */
export async function recordAudit(req: Request, actor: AuditActor, entry: AuditEntry) {
  await writeAudit({ ...actor, ip: clientIp(req) }, entry)
}
