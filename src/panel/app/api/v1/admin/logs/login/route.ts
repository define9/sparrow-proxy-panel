import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginLogs } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:log:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const level = url.searchParams.get('level')?.trim() ?? ''
  const hours = Number(url.searchParams.get('range')) || 0

  const conditions = []
  if (level === 'info') conditions.push(eq(loginLogs.success, true))
  if (level === 'warn' || level === 'error') conditions.push(eq(loginLogs.success, false))
  if (hours > 0) {
    conditions.push(gte(loginLogs.createdAt, new Date(Date.now() - hours * 3_600_000)))
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
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(loginLogs).where(where)

  return list(
    rows.map((row) => ({
      id: row.id,
      category: 'login' as const,
      level: (row.success ? 'info' : 'warn') as 'info' | 'warn',
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
    pageMeta(Number(countRow?.total ?? 0), page)
  )
})
