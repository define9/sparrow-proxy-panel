import { ok, route } from '@/lib/api/response'
import { agentHeartbeatSchema } from '@/lib/api/node-schemas'
import { authenticateAgent } from '@/lib/agent/auth'
import { recordHeartbeat } from '@/lib/services/agent'

export const POST = route(async (req: Request) => {
  const { node, rawBody } = await authenticateAgent(req)
  const body = agentHeartbeatSchema.parse(rawBody ? JSON.parse(rawBody) : {})

  return ok(await recordHeartbeat(node.id, body))
})
