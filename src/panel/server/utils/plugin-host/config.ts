import type { PluginManifest } from '@sparrow/contracts'
import {
  configSchemaDefaults,
  describeConfigSchema,
  maskConfigValues,
  PLUGIN_RESERVED_CONFIG_KEYS,
  PLUGIN_SECRET_MASK,
  validateConfigValues
} from '#shared/utils/plugin-config'
import type { PluginConfigIssue, PluginConfigSchema } from '#shared/utils/plugin-config'

/**
 * 插件配置的组装与校验。
 *
 * 配置项由 manifest.configSchema（JSON Schema）描述：
 * - 表单由前端自动生成
 * - 保存时服务端按同一份 schema 校验
 * - secret 字段回显脱敏
 *
 * TODO(security): 主密钥加密层（runtimeConfig.masterKey）就绪后，
 * secret 字段应加密存储；当前先明文落库，读取时脱敏。
 */

export interface PluginConfigBuildResult {
  config: Record<string, unknown>
  issues: PluginConfigIssue[]
}

/** 取插件的配置 schema（归一化后） */
export function pluginConfigSchema(manifest: Pick<PluginManifest, 'configSchema'>): PluginConfigSchema {
  return describeConfigSchema(manifest.configSchema)
}

/** 组装新配置：默认值 + 传入值 */
export function buildPluginConfig(
  manifest: Pick<PluginManifest, 'configSchema'>,
  input: Record<string, unknown> = {}
): PluginConfigBuildResult {
  const schema = pluginConfigSchema(manifest)
  const config = { ...configSchemaDefaults(schema), ...input }
  const issues = validateConfigValues(config, schema)

  return { config, issues }
}

/**
 * 合并配置（更新场景）。
 *
 * - 未提交的字段沿用旧值
 * - secret 字段回传脱敏占位符时保留旧值
 * - 保留键（__plugin_token）不可被外部覆盖
 */
export function mergePluginConfig(
  manifest: Pick<PluginManifest, 'configSchema'>,
  current: Record<string, unknown>,
  input: Record<string, unknown>
): PluginConfigBuildResult {
  const schema = pluginConfigSchema(manifest)
  const config: Record<string, unknown> = { ...current }

  for (const [key, value] of Object.entries(input)) {
    if ((PLUGIN_RESERVED_CONFIG_KEYS as readonly string[]).includes(key)) {
      continue
    }
    const field = schema.fields.find(item => item.key === key)
    if (field?.secret && (value === PLUGIN_SECRET_MASK || value === undefined)) {
      // 脱敏回显：保持原值
      continue
    }
    config[key] = value
  }

  const issues = validateConfigValues(config, schema)

  return { config, issues }
}

/** 配置脱敏（返回给前端） */
export function maskPluginConfig(
  manifest: Pick<PluginManifest, 'configSchema'>,
  config: Record<string, unknown>
): Record<string, unknown> {
  return maskConfigValues(config, pluginConfigSchema(manifest))
}
