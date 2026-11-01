import { ApiError, clientIp, created, route } from '@/lib/api/response'
import { setupSchema } from '@/lib/api/schemas'
import { createSession } from '@/lib/auth/session'
import { getSetupStatus, initializeSite } from '@/lib/services/setup'

/**
 * 站点初始化：只在未初始化时可调用，成功后自动登录。
 *
 * 安全：
 * - 已初始化 → 409
 * - 来源不是本机且未配置 SETUP_TOKEN → 403（避免公网抢注管理员）
 * - 并发提交由 settings 主键抢占，只有一个能成功
 */
export const POST = route(async (req: Request) => {
  const status = await getSetupStatus()
  if (status.initialized) {
    throw new ApiError(409, 'SETUP_ALREADY_DONE', '站点已完成初始化，请直接登录')
  }

  const ip = clientIp(req)
  if (!isLoopback(ip) && !process.env.SETUP_TOKEN) {
    throw new ApiError(
      403,
      'SETUP_FORBIDDEN',
      '站点尚未初始化且请求不来自本机：请设置环境变量 SETUP_TOKEN 后在初始化页面填入'
    )
  }

  const body = setupSchema.parse(await req.json())
  const admin = await initializeSite(
    {
      siteName: body.siteName,
      email: body.email,
      username: body.username,
      password: body.password,
      token: body.token
    },
    { ip }
  )

  await createSession(admin.userId, {
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined
  })

  return created({ user: admin, permissions: ['*'] })
})

function isLoopback(ip?: string) {
  // 本机开发/直连部署时没有 x-forwarded-for
  if (!ip) return true
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}
