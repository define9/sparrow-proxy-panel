import { ok, route } from '@/lib/api/response'
import { agentTrafficSchema } from '@/lib/api/node-schemas'
import { authenticateAgent } from '@/lib/agent/auth'
import { ingestTraffic } from '@/lib/services/agent'

export const POST = route(async (req: Request) => {
  const { node, rawBody } = await authenticateAgent(req)
  const body = agentTrafficSchema.parse(rawBody ? JSON.parse(rawBody) : {})

  return ok(await ingestTraffic(node.id, body), { status: 202 })
})
