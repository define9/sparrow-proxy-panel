import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parseJson, parsePage } from '@/lib/api/admin-ops'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:log:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const level = url.searchParams.get('level')?.trim() ?? ''
  const hours = Number(url.searchParams.get('range')) || 0

  const conditions = []
  if (level && level !== 'all') {
    conditions.push(eq(auditLogs.level, level as 'info' | 'warn' | 'error'))
  }
  if (hours > 0) {
    conditions.push(gte(auditLogs.createdAt, new Date(Date.now() - hours * 3_600_000)))
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
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(auditLogs).where(where)

  return list(
    rows.map((row) => {
      const meta = parseJson<Record<string, unknown>>(row.meta)
      return {
        id: row.id,
        category: 'audit' as const,
        level: row.level,
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
    pageMeta(Number(countRow?.total ?? 0), page)
  )
})
