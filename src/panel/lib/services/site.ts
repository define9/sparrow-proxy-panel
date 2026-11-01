import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { announcements, settings } from '@/lib/db/schema'

export interface SiteAnnouncement {
  id: string
  title: string
  content: string
  level: 'info' | 'warn' | 'error'
  publishedAt: string
}

export interface SiteConfig {
  name: string
  logo: string
  icp: string
  /** settings.site.announcement 里的一行公告 */
  announcement: string
  registerOpen: boolean
  announcements: SiteAnnouncement[]
}

export interface PanelStatus {
  status: 'ok' | 'degraded'
  uptimeSeconds: number
  nodes: { total: number; online: number }
  timestamp: string
}

function parseJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

/** 站点配置 + 已发布公告（公告表为空时退回 settings 里的一行公告） */
export async function getSiteConfig(): Promise<SiteConfig> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, ['site', 'register']))

  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const site = parseJson(byKey.get('site'))
  const register = parseJson(byKey.get('register'))

  const published = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      level: announcements.level,
      publishedAt: announcements.publishedAt
    })
    .from(announcements)
    .where(and(eq(announcements.status, 'published'), eq(announcements.scope, 'global')))
    .orderBy(desc(announcements.publishedAt))
    .limit(5)

  const list: SiteAnnouncement[] = published.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    level: item.level,
    publishedAt: item.publishedAt.toISOString()
  }))

  const inline = asString(site.announcement)
  if (list.length === 0 && inline) {
    list.push({
      id: 'site-announcement',
      title: '站点公告',
      content: inline,
      level: 'info',
      publishedAt: new Date().toISOString()
    })
  }

  return {
    name: asString(site.name, 'Sparrow Panel'),
    logo: asString(site.logo),
    icp: asString(site.icp),
    announcement: inline,
    registerOpen: asBoolean(register.open, true),
    announcements: list
  }
}

/** 探活用：面板存活 + 节点在线数；数据库不可用时不抛错，降级为 degraded */
export async function getPanelStatus(): Promise<PanelStatus> {
  const base = {
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  }

  try {
    const { rows } = await db.execute(sql`
      select
        (select count(*) from nodes) as total,
        (select count(*) from nodes where status = 'online') as online
    `)
    const row = (rows[0] ?? {}) as Record<string, unknown>
    return {
      status: 'ok',
      ...base,
      nodes: { total: Number(row.total ?? 0), online: Number(row.online ?? 0) }
    }
  } catch (error) {
    console.error('[public/status] database unavailable', error)
    return { status: 'degraded', ...base, nodes: { total: 0, online: 0 } }
  }
}
