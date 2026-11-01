import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscriptions, trafficLogs } from '@/lib/db/schema'
import { ok, route } from '@/lib/api/response'
import { agentTrafficSchema } from '@/lib/api/node-schemas'
import { authenticateAgent } from '@/lib/agent/auth'
import { resolveUids } from '@/lib/agent/config'
import { getMaxSeq, rememberSeq } from '@/lib/agent/traffic'

export const POST = route(async (req: Request) => {
  const { node, rawBody } = await authenticateAgent(req)
  const body = agentTrafficSchema.parse(rawBody ? JSON.parse(rawBody) : {})

  const maxSeq = getMaxSeq(node.id)
  if (body.seq <= maxSeq) {
    return ok({ accepted: 0, seq: maxSeq, duplicate: true }, { status: 202 })
  }

  const items = body.items.filter((item) => item.upload > 0 || item.download > 0)
  const uidMap = await resolveUids(items.map((item) => item.uid))

  const logs = []
  for (const item of items) {
    const target = uidMap.get(item.uid)
    if (!target) continue
    logs.push({
      userId: target.userId,
      nodeId: node.id,
      upload: String(item.upload),
      download: String(item.download)
    })

    await db
      .update(subscriptions)
      .set({
        trafficUsed: sql`${subscriptions.trafficUsed} + ${item.upload + item.download}`,
        download: sql`${subscriptions.download} + ${item.download}`,
        upload: sql`${subscriptions.upload} + ${item.upload}`,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, target.subscriptionId))
  }

  if (logs.length > 0) {
    await db.insert(trafficLogs).values(logs)
  }

  rememberSeq(node.id, body.seq)

  return ok({ accepted: logs.length, seq: body.seq }, { status: 202 })
})
