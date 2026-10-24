/**
 * 从 `$fetch` / `ofetch` 的异常里取出面向用户的错误提示。
 *
 * 后端错误响应形如：
 * ```json
 * { "statusCode": 422, "code": "NODE_NOT_FOUND", "message": "节点不存在", "data": { "code": "...", "message": "..." } }
 * ```
 */
export function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const err = error as {
    data?: {
      data?: { message?: string }
      message?: string
    }
    message?: string
  }

  return err.data?.data?.message ?? err.data?.message ?? err.message
}
