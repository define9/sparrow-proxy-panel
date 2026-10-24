import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

/**
 * 校验请求体（zod），失败统一返回 422 + 契约格式的错误体。
 *
 * 命名刻意避开 h3 内置的 readValidatedBody，避免 Nuxt 自动导入冲突。
 */
export async function validateBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const body = await readBody(event)
  const result = schema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'VALIDATION_FAILED',
      message: '参数校验失败',
      data: {
        code: 'VALIDATION_FAILED',
        message: '参数校验失败',
        issues: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    })
  }

  return result.data
}

/** 业务错误：统一错误码与提示 */
export function apiError(
  statusCode: number,
  code: string,
  message: string,
  data?: Record<string, unknown>
): never {
  throw createError({
    statusCode,
    statusMessage: code,
    message,
    data: { code, message, data }
  })
}
