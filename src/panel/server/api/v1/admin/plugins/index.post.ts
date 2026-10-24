import { randomBytes } from 'node:crypto'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { buildPluginConfig } from '../../../../utils/plugin-host/config'
import { toPluginDto } from '../../../../utils/plugin-host/dto'
import { PluginManifestError, validatePluginManifest } from '../../../../utils/plugin-host/manifest'
import { verifyManifestChecksum } from '../../../../utils/plugin-host/source'
import { getPluginByKey, insertPlugin } from '../../../../utils/plugin-host/store'

/**
 * POST /api/v1/admin/plugins
 *
 * 安装插件：校验 manifest → 校验 checksum → 落库。
 *
 * 每个插件生成独立 token（存配置保留键 __plugin_token）：
 * 面板调用插件时用它做 Bearer 鉴权，插件回调面板时也校验同一个 token。
 */

/** 生成插件 token */
function generatePluginToken(): string {
  return randomBytes(24).toString('hex')
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_WRITE)

  const body = await readBody(event) as Record<string, unknown> | undefined
  const manifestInput = body?.manifest

  let manifest
  try {
    manifest = validatePluginManifest(manifestInput)
  } catch (error) {
    if (error instanceof PluginManifestError) {
      apiError(422, 'PLUGIN_MANIFEST_INVALID', '插件清单校验失败', { issues: error.issues })
    }
    throw error
  }

  // checksum 校验：声明了就必须对得上
  const declaredChecksum = typeof body?.checksum === 'string' ? body.checksum : null
  if (declaredChecksum && !verifyManifestChecksum(manifest, declaredChecksum)) {
    apiError(422, 'PLUGIN_CHECKSUM_MISMATCH', '插件 checksum 校验失败', {
      expected: declaredChecksum
    })
  }

  const existing = await getPluginByKey(manifest.key)
  if (existing) {
    apiError(409, 'PLUGIN_ALREADY_EXISTS', `插件 ${manifest.key} 已存在`, { id: existing.id })
  }

  const inputConfig = body?.config && typeof body.config === 'object' && !Array.isArray(body.config)
    ? body.config as Record<string, unknown>
    : {}
  const { config, issues } = buildPluginConfig(manifest, inputConfig)

  if (issues.length > 0) {
    apiError(422, 'PLUGIN_CONFIG_INVALID', '插件配置校验失败', { issues })
  }

  // 每个插件一个 token
  const token = generatePluginToken()
  const storedConfig: Record<string, unknown> = { ...config, __plugin_token: token }

  const sourceType = typeof body?.sourceType === 'string'
    ? body.sourceType as 'builtin' | 'marketplace' | 'url' | 'upload'
    : 'upload'

  const row = await insertPlugin({
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    runtime: manifest.runtime,
    sourceType,
    sourceUrl: typeof body?.sourceUrl === 'string'
      ? body.sourceUrl
      : (manifest.entry ?? null),
    checksum: declaredChecksum ?? manifest.checksum ?? null,
    signature: manifest.signature ?? null,
    manifest: manifest as unknown as Record<string, unknown>,
    config: storedConfig,
    permissions: manifest.permissions,
    hooks: manifest.hooks,
    status: 'installed'
  })

  setResponseStatus(event, 201)

  return {
    ...toPluginDto(row),
    // token 只在安装时返回一次，详情接口只给脱敏值
    pluginToken: token
  }
})
