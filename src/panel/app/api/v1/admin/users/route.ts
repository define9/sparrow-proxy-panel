import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roles, subscriptions, users } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { normalizeUserStatus, numeric, pageMeta, parsePage } from '@/lib/api/admin-ops'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:user:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const role = url.searchParams.get('role')?.trim() ?? ''
  const status = url.searchParams.get('status')?.trim() ?? ''

  const conditions = []
  if (q) {
    conditions.push(or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`)))
  }
  if (role && role !== 'all') {
    conditions.push(eq(users.roleCode, role))
  }
  if (status && status !== 'all') {
    const normalized = normalizeUserStatus(status)
    if (normalized) conditions.push(eq(users.status, normalized))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      roleCode: users.roleCode,
      roleName: roles.name,
      status: users.status,
      balance: users.balance,
      trafficLimit: users.trafficLimit,
      trafficUsed: users.trafficUsed,
      remark: users.remark,
      twofaEnabled: users.twofaEnabled,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      subscriptionCount: sql<number>`(
        select count(*)::int from ${subscriptions}
        where ${subscriptions.userId} = ${users.id}
          and ${subscriptions.status} = 'active'
      )`
    })
    .from(users)
    .leftJoin(roles, eq(roles.code, users.roleCode))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db
    .select({ total: sql<string>`count(*)` })
    .from(users)
    .where(where)

  const total = Number(countRow?.total ?? 0)

  return list(
    rows.map((row) => ({
      ...row,
      balance: numeric(row.balance).toFixed(2),
      trafficLimit: numeric(row.trafficLimit),
      trafficUsed: numeric(row.trafficUsed),
      subscriptionCount: Number(row.subscriptionCount ?? 0),
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    })),
    pageMeta(total, page)
  )
})
