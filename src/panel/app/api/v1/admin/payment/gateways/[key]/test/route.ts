import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { testGateway } from '@/lib/payments'

type Ctx = { params: Promise<{ key: string }> }

/** 测试渠道配置：必填项校验 + 网关地址探测（连通性失败不算致命） */
export const POST = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:settings:write')
  const { key } = await ctx.params
  return ok(await testGateway(key))
})
