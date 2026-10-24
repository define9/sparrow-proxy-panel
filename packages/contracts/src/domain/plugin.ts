import { z } from 'zod'
import { DateTimeSchema, IdSchema } from '../common'

export const PluginTypeSchema = z.enum(['payment', 'node_source', 'subscription', 'notify', 'hook', 'ui'])
export type PluginType = z.infer<typeof PluginTypeSchema>

export const PluginRuntimeSchema = z.enum(['builtin', 'external'])
export type PluginRuntime = z.infer<typeof PluginRuntimeSchema>

export const PluginStatusSchema = z.enum(['installed', 'disabled', 'error'])
export type PluginStatus = z.infer<typeof PluginStatusSchema>

/** 插件可触发的扩展点 */
export const PLUGIN_HOOKS = [
  'user.registered',
  'user.login',
  'order.created',
  'order.paid',
  'order.expired',
  'subscription.created',
  'subscription.expiring',
  'subscription.render',
  'node.source.fetch',
  'node.config.render',
  'payment.gateway',
  'payment.callback',
  'notification.send',
  'telemetry.report'
] as const

export type PluginHook = (typeof PLUGIN_HOOKS)[number]

/** 插件清单 */
export const PluginManifestSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/, '插件 key 只能包含小写字母、数字与连字符'),
  name: z.string(),
  version: z.string(),
  type: PluginTypeSchema,
  description: z.string().nullish(),
  author: z.string().nullish(),
  runtime: PluginRuntimeSchema.default('external'),
  entry: z.string().nullish(),
  checksum: z.string().nullish(),
  signature: z.string().nullish(),
  permissions: z.array(z.string()).default([]),
  hooks: z.array(z.enum(PLUGIN_HOOKS)).default([]),
  configSchema: z.record(z.string(), z.unknown()).default({}),
  ui: z.object({
    page: z.string().nullish(),
    nav: z.object({
      label: z.string(),
      icon: z.string().nullish()
    }).nullish()
  }).nullish(),
  compatibility: z.object({
    panel: z.string().optional()
  }).optional()
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>

export const PluginSchema = z.object({
  id: IdSchema,
  key: z.string(),
  name: z.string(),
  version: z.string(),
  type: PluginTypeSchema,
  runtime: PluginRuntimeSchema,
  sourceType: z.enum(['builtin', 'marketplace', 'url', 'upload']),
  sourceUrl: z.string().nullish(),
  checksum: z.string().nullish(),
  permissions: z.array(z.string()),
  hooks: z.array(z.string()),
  status: PluginStatusSchema,
  error: z.string().nullish(),
  installedAt: DateTimeSchema,
  updatedAt: DateTimeSchema
})
export type Plugin = z.infer<typeof PluginSchema>

export const PluginSourceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: z.enum(['url', 'git', 'marketplace']),
  url: z.string(),
  enabled: z.boolean(),
  lastSyncAt: DateTimeSchema.nullish(),
  lastStatus: z.enum(['pending', 'success', 'failed']).nullish(),
  lastError: z.string().nullish(),
  checksum: z.string().nullish(),
  createdAt: DateTimeSchema
})
export type PluginSource = z.infer<typeof PluginSourceSchema>
