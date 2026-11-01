import { ok, route } from '@/lib/api/response'
import { agentRegisterSchema } from '@/lib/api/node-schemas'
import { parseRegistrationToken } from '@/lib/agent/secret'
import { registerNode } from '@/lib/services/agent'

/**
 * Agent 首次注册：一次性 registration token 验签后交给 service 落库。
 * nodeSecret 明文只在响应里返回一次。
 */
export const POST = route(async (req: Request) => {
  const { nodeId } = parseRegistrationToken(req.headers.get('x-registration-token'))

  const raw = await req.text()
  const body = agentRegisterSchema.parse(raw ? JSON.parse(raw) : {})

  return ok(await registerNode(nodeId, body))
})
