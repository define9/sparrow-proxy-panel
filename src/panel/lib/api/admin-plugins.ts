import 'server-only'
import type { pluginJobs, plugins } from '@/lib/db/schema'
import { iso, numeric, parseJson } from '@/lib/api/admin-ops'

interface ManifestShape {
  hooks?: string[]
  description?: string
  author?: string
  compatibility?: string
  signed?: boolean
}

export function pluginManifest(value: string | null) {
  return parseJson<ManifestShape>(value) ?? {}
}

export function pluginDto(row: typeof plugins.$inferSelect) {
  const manifest = pluginManifest(row.manifest)
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    version: row.version,
    type: row.type,
    status: row.status,
    health: row.health,
    repoUrl: row.repoUrl,
    gitRef: row.gitRef,
    commitSha: row.commitSha,
    runtime: row.runtime,
    entry: row.entry,
    build: row.build,
    uiMode: row.uiMode,
    signed: manifest.signed ?? Boolean(row.checksum),
    permissions: row.permissions,
    grantedScopes: row.grantedScopes,
    egress: row.egress,
    hooks: manifest.hooks ?? [],
    description: manifest.description ?? '',
    author: manifest.author ?? '',
    compatibility: manifest.compatibility ?? '',
    activeVersion: row.activeVersion,
    previousVersion: row.previousVersion,
    lastError: row.lastError,
    lastHealthAt: iso(row.lastHealthAt),
    installedAt: iso(row.installedAt),
    updatedAt: iso(row.updatedAt)
  }
}

const SECRET_KEY = /(secret|password|token|apikey|api_key|private)/i

/** 插件配置：把 JSON 对象转成管理端表单字段，并遮蔽敏感值 */
export function pluginConfigFields(value: string | null) {
  const config = parseJson<Record<string, unknown>>(value)
  if (!config) return []

  return Object.entries(config).map(([key, raw]) => {
    const secret = SECRET_KEY.test(key)
    const type =
      typeof raw === 'boolean' ? 'switch' : typeof raw === 'number' ? 'number' : secret ? 'password' : 'text'
    return {
      key,
      label: key,
      type,
      secret,
      value: secret ? '••••••••' : String(raw ?? '')
    }
  })
}

const JOB_STATUS: Record<string, 'success' | 'failed' | 'skipped'> = {
  ok: 'success',
  running: 'success',
  failed: 'failed',
  timeout: 'failed',
  skipped: 'skipped'
}

export function pluginJobDto(row: typeof pluginJobs.$inferSelect) {
  return {
    id: row.id,
    key: row.jobKey,
    cron: row.cron,
    handler: row.handler,
    enabled: row.enabled,
    nextRunAt: iso(row.nextRunAt),
    lastRunAt: iso(row.lastRunAt),
    lastStatus: row.lastStatus ? (JOB_STATUS[row.lastStatus] ?? 'skipped') : 'skipped',
    durationMs: 0
  }
}

export function pluginEventDto(row: {
  id: string
  hook: string
  status: string
  durationMs: number
  level: 'info' | 'warn' | 'error'
  error: string | null
  payload: string | null
  createdAt: Date
}) {
  return {
    id: row.id,
    at: iso(row.createdAt),
    level: row.level,
    message: row.error ? `${row.hook} 失败：${row.error}` : `${row.hook}（${row.status}，${row.durationMs}ms）`,
    payload: parseJson<unknown>(row.payload)
  }
}

export function pluginRunDto(row: {
  id: string
  runId: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
  error: string | null
  result: string | null
}) {
  return {
    id: row.id,
    runId: row.runId,
    status: row.status,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs === null ? null : numeric(row.durationMs),
    error: row.error,
    result: parseJson<unknown>(row.result)
  }
}
