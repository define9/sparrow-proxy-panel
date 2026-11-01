import { clientIp, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { destroySession } from '@/lib/auth/session'
import { revokeSession } from '@/lib/services/profile'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession()
  const { id } = await ctx.params

  await revokeSession(session.user.id, id, { email: session.user.email, ip: clientIp(req) })

  // 吊销自己的当前会话 = 登出，顺手清掉 cookie，避免前端带着失效 id 继续请求
  if (id === session.sessionId) await destroySession()

  return noContent()
})
