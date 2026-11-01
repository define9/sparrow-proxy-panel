import { desc, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { pluginSources } from '@/lib/db/schema'
import { created, list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'

const sourceInputSchema = z.object({
  name: z.string().trim().min(1, '请填写索引源名称').max(64),
  type: z.enum(['url', 'git', 'marketplace']).default('url'),
  url: z
    .string()
    .trim()
    .url('请填写合法地址')
    .refine((value) => value.startsWith('https://'), '只允许 https 地址'),
  enabled: z.boolean().default(true)
})

function toDto(row: typeof pluginSources.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    status: row.lastStatus === 'healthy' || row.lastStatus === 'error' ? row.lastStatus : 'unknown',
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString()
  }
}

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:plugin:read')

  const url = new URL(req.url)
  const page = parsePage(url, 50)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const where = q ? ilike(pluginSources.name, `%${q}%`) : undefined

  const rows = await db
    .select()
    .from(pluginSources)
    .where(where)
    .orderBy(desc(pluginSources.createdAt))
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(pluginSources).where(where)

  return list(rows.map(toDto), pageMeta(Number(countRow?.total ?? 0), page))
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:plugin:write')
  const body = sourceInputSchema.parse(await req.json())

  const [row] = await db
    .insert(pluginSources)
    .values({ name: body.name, type: body.type, url: body.url, enabled: body.enabled })
    .returning()

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plugin_source.create',
      targetType: 'plugin_source',
      targetId: row.id,
      message: `新建索引源「${row.name}」(${row.type})`,
      meta: { url: row.url, enabled: row.enabled }
    }
  )

  return created(toDto(row))
})
