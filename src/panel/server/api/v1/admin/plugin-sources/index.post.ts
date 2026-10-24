import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { toPluginSourceDto } from '../../../../utils/plugin-host/dto'
import { insertPluginSource } from '../../../../utils/plugin-host/store'

/**
 * POST /api/v1/admin/plugin-sources
 *
 * 新增三方源。
 *
 * TODO: 目前只实现 url 类型（HTTP JSON 索引）；
 * git 类型（仓库 manifest 目录）与 marketplace 类型（内置市场）待后续迭代。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_WRITE)

  const body = await readBody(event) as Record<string, unknown> | undefined

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    apiError(422, 'VALIDATION_FAILED', '三方源名称不能为空')
  }

  const type = typeof body?.type === 'string' ? body.type : ''
  if (type !== 'url') {
    // TODO: git / marketplace 类型三方源尚未实现
    apiError(400, 'PLUGIN_SOURCE_TYPE_UNSUPPORTED', '目前只支持 url 类型的插件三方源', {
      type
    })
  }

  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!url) {
    apiError(422, 'VALIDATION_FAILED', '三方源地址不能为空')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    apiError(422, 'VALIDATION_FAILED', '三方源地址不是合法 URL')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    apiError(422, 'VALIDATION_FAILED', '三方源地址必须是 http(s)')
  }

  const row = await insertPluginSource({
    name,
    type: 'url',
    url,
    enabled: true,
    lastStatus: 'pending'
  })

  setResponseStatus(event, 201)

  return toPluginSourceDto(row)
})
