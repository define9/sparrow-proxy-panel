import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentEvents, nodes } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parseJson, parsePage } from '@/lib/api/admin-ops'

/** 节点事件：直接读 agent_events，按 nodes.name 补可读的操作者/目标 */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:log:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const level = url.searchParams.get('level')?.trim() ?? ''
  const hours = Number(url.searchParams.get('range')) || 0

  const conditions = []
  if (level && level !== 'all') conditions.push(eq(agentEvents.level, level))
  if (hours > 0) {
    conditions.push(gte(agentEvents.createdAt, new Date(Date.now() - hours * 3_600_000)))
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
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db
    .select({ total: sql<string>`count(*)` })
    .from(agentEvents)
    .leftJoin(nodes, eq(nodes.id, agentEvents.nodeId))
    .where(where)

  return list(
    rows.map(({ event, nodeName }) => ({
      id: event.id,
      category: 'agent' as const,
      level: (['info', 'warn', 'error'].includes(event.level) ? event.level : 'info') as
        | 'info'
        | 'warn'
        | 'error',
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
    pageMeta(Number(countRow?.total ?? 0), page)
  )
})
