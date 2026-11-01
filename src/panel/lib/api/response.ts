import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/**
 * 错误码约定（机器可读）：AUTH_* 认证、PERM_* 权限、TOKEN_* 编程凭据（PAT）、
 * USER_* / PLAN_* / ORDER_* … 按资源分段，完整表见 docs/architecture/api-design.md。
 */
export const TOKEN_SCOPE_DENIED = 'TOKEN_SCOPE_DENIED'

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public data?: unknown
  ) {
    super(message)
  }
}

export interface ListMeta {
  total: number
  page?: number
  pageSize?: number
  nextCursor?: string | null
  hasMore?: boolean
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 })
}

export function list<T>(data: T[], meta: ListMeta) {
  return NextResponse.json({ data, meta })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function errorBody(error: ApiError) {
  return {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    data: error.data ?? {}
  }
}

/** 统一把未知异常翻译成契约里的错误响应 */
export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(errorBody(error), { status: error.statusCode })
  }

  if (error instanceof ZodError) {
    const first = error.issues[0]
    return NextResponse.json(
      {
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        message: first?.message ?? '请求参数不合法',
        data: { path: first?.path?.join('.') ?? '' }
      },
      { status: 422 }
    )
  }

  console.error('[api] unhandled error', error)
  return NextResponse.json(
    { statusCode: 500, code: 'INTERNAL_ERROR', message: '服务器内部错误', data: {} },
    { status: 500 }
  )
}

/** Route Handler 包装：统一 try/catch，不吞掉 Next 的 redirect/notFound */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await handler(req, ctx)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** 读取 JSON body：非法 JSON 按 400 处理，避免 SyntaxError 落到 500 */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求体不是合法的 JSON')
  }
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim()
  return req.headers.get('x-real-ip') ?? undefined
}
