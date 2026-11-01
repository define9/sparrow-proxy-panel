import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import {
  jobStatusEnum,
  logLevelEnum,
  pluginHealthEnum,
  pluginStatusEnum,
  pluginTypeEnum
} from './enums'

export const plugins = pgTable(
  'plugins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    type: pluginTypeEnum('type').notNull(),
    sourceType: text('source_type').notNull().default('git'),
    repoUrl: text('repo_url').notNull(),
    gitRef: text('git_ref'),
    commitSha: text('commit_sha').notNull(),
    runtime: text('runtime').notNull().default('process'),
    entry: text('entry').notNull().default('dist/index.js'),
    build: text('build').notNull().default('none'),
    uiMode: text('ui_mode').notNull().default('schema'),
    checksum: text('checksum'),
    manifest: text('manifest'),
    config: text('config'),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    grantedScopes: text('granted_scopes').array().notNull().default(sql`'{}'::text[]`),
    egress: text('egress').array().notNull().default(sql`'{}'::text[]`),
    activeVersion: text('active_version'),
    previousVersion: text('previous_version'),
    health: pluginHealthEnum('health').notNull().default('unknown'),
    lastHealthAt: timestamp('last_health_at', { withTimezone: true }),
    status: pluginStatusEnum('status').notNull().default('installed'),
    lastError: text('last_error'),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('plugins_repo_commit_idx').on(table.repoUrl, table.commitSha),
    index('plugins_status_idx').on(table.status)
  ]
)

export const pluginEvents = pgTable(
  'plugin_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pluginId: uuid('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    hook: text('hook').notNull(),
    status: jobStatusEnum('status').notNull().default('ok'),
    durationMs: integer('duration_ms').notNull().default(0),
    level: logLevelEnum('level').notNull().default('info'),
    error: text('error'),
    payload: text('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('plugin_events_created_idx').on(table.createdAt)]
)

/** 插件定时任务的物化表 */
export const pluginJobs = pgTable(
  'plugin_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pluginKey: text('plugin_key').notNull(),
    jobKey: text('job_key').notNull(),
    cron: text('cron').notNull(),
    handler: text('handler').notNull(),
    payload: text('payload'),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: jobStatusEnum('last_status')
  },
  (table) => [
    uniqueIndex('plugin_jobs_key_idx').on(table.pluginKey, table.jobKey),
    index('plugin_jobs_due_idx').on(table.enabled, table.nextRunAt)
  ]
)

export const pluginJobRuns = pgTable(
  'plugin_job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => pluginJobs.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().defaultRandom().unique(),
    status: jobStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    error: text('error'),
    result: text('result')
  },
  (table) => [index('plugin_job_runs_job_idx').on(table.jobId, table.status)]
)

export const pluginSources = pgTable('plugin_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull().default('url'),
  url: text('url').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
