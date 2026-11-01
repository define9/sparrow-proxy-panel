import { z } from 'zod'
import { ok, route } from '@/lib/api/response'
import { authenticateAgent } from '@/lib/agent/auth'
import { ackCommand } from '@/lib/services/agent'

const ackSchema = z.object({
  status: z.enum(['success', 'failed']).default('success'),
  result: z.unknown().optional()
})

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { node, rawBody } = await authenticateAgent(req)
  const { id } = await ctx.params
  const body = ackSchema.parse(rawBody ? JSON.parse(rawBody) : {})

  return ok(await ackCommand(node.id, id, body))
})
