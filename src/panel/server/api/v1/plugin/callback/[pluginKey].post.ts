import { createHash, timingSafeEqual } from 'node:crypto'
import { PLUGIN_HOOKS } from '@sparrow/contracts'
import { isPluginHook } from '../../../../utils/plugin-host/manifest'
import { callHook, getPluginHost } from '../../../../utils/plugin-host/runtime'
import { resolvePluginToken } from '../../../../utils/plugin-host/external'
import { getPluginByKey } from '../../../../utils/plugin-host/store'

/**
 * POST /api/v1/plugin/callback/:pluginKey
 *
 * 插件回调入口：外置插件拿到面板下发的数据后，可以回调面板触发后续 hook。
 *
 * 鉴权：请求头 Authorization: Bearer <plugin_token>，与该插件的 token 一致才放行。
 */

/** 常量时间比较（先摘要再比较，避免长度不同的报错） */
function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}

/** 从请求头取出 Bearer token */
function readBearerToken(event: Parameters<typeof getRequestHeader>[0]): string | null {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? null
}

export default defineEventHandler(async (event) => {
  const pluginKey = getRouterParam(event, 'pluginKey')
  if (!pluginKey) {
    apiError(400, 'PLUGIN_KEY_MISSING', '缺少插件标识')
  }

  const row = await getPluginByKey(pluginKey)
  if (!row) {
    apiError(404, 'PLUGIN_NOT_INSTALLED', '插件未安装')
  }

  if (row.status !== 'installed') {
    apiError(403, 'PLUGIN_DISABLED', '插件已禁用')
  }

  const expected = resolvePluginToken(row.config)
  const provided = readBearerToken(event)

  if (!expected || !provided || !safeEqual(expected, provided)) {
    apiError(401, 'PLUGIN_AUTH_FAILED', '插件 token 校验失败')
  }

  const body = await readBody(event) as Record<string, unknown> | undefined
  const hook = typeof body?.hook === 'string' ? body.hook : ''

  if (!isPluginHook(hook)) {
    apiError(422, 'PLUGIN_HOOK_INVALID', '未知的 hook', {
      hooks: [...PLUGIN_HOOKS]
    })
  }

  if (!row.hooks.includes(hook)) {
    apiError(403, 'PLUGIN_HOOK_NOT_ALLOWED', '插件未声明该 hook', { hook })
  }

  const payload = body?.payload ?? body ?? {}
  const startedAt = Date.now()

  const result = await callHook(hook, payload, { exclude: [row.key] })

  // 回调本身也记一条事件，方便在插件日志里回溯
  await getPluginHost().recordEvent({
    pluginId: row.id,
    pluginKey: row.key,
    hook,
    status: 'success',
    durationMs: Date.now() - startedAt,
    error: null,
    payload: payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : { value: payload }
  })

  return {
    ok: true,
    hook,
    results: result.results,
    data: result.data
  }
})
