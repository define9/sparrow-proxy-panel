import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentEvents, nodes } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { agentRegisterSchema } from '@/lib/api/node-schemas'
import { generateNodeSecret, parseRegistrationToken, sealSecret } from '@/lib/agent/secret'

export const AGENT_HEARTBEAT_INTERVAL = 30
export const AGENT_CONFIG_POLL_INTERVAL = 300

/**
 * Agent 首次注册：一次性 registration token → nodeSecret。
 * nodeSecret 明文只在这里返回一次，之后库里只有加密值 + sha256。
 */
export const POST = route(async (req: Request) => {
  const { nodeId } = parseRegistrationToken(req.headers.get('x-registration-token'))

  const raw = await req.text()
  const body = agentRegisterSchema.parse(raw ? JSON.parse(raw) : {})

  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1)
  if (!node) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在或已被删除')

  const nodeSecret = generateNodeSecret()
  await db
    .update(nodes)
    .set({
      agentSecretHash: sealSecret(nodeSecret),
      agentVersion: body.agentVersion ?? node.agentVersion,
      status: 'online',
      lastSeenAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, nodeId))

  await db.insert(agentEvents).values({
    nodeId,
    type: 'register',
    level: 'info',
    message: `Agent ${body.agentVersion ?? 'unknown'} 注册成功（${body.hostname ?? body.ip ?? 'unknown'}）`,
    payload: JSON.stringify(body)
  })

  return ok({
    nodeId,
    nodeSecret,
    heartbeatInterval: AGENT_HEARTBEAT_INTERVAL,
    configPollInterval: AGENT_CONFIG_POLL_INTERVAL
  })
})
