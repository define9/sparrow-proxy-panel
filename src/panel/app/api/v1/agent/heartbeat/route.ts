import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeHeartbeats, nodes } from '@/lib/db/schema'
import { ok, route } from '@/lib/api/response'
import { agentHeartbeatSchema } from '@/lib/api/node-schemas'
import { authenticateAgent } from '@/lib/agent/auth'
import { MIN_AGENT_VERSION } from '@/lib/agent/config'

export const POST = route(async (req: Request) => {
  const { node, rawBody } = await authenticateAgent(req)
  const body = agentHeartbeatSchema.parse(rawBody ? JSON.parse(rawBody) : {})

  const reportedAt = body.reportedAt ? new Date(body.reportedAt) : new Date()
  const safeReportedAt = Number.isNaN(reportedAt.getTime()) ? new Date() : reportedAt

  await db
    .insert(nodeHeartbeats)
    .values({
      nodeId: node.id,
      status: body.status,
      cpu: body.cpu.toFixed(2),
      memory: body.memory.toFixed(2),
      disk: body.disk.toFixed(2),
      netRx: String(body.netRx),
      netTx: String(body.netTx),
      onlineUsers: body.onlineUsers,
      agentVersion: body.agentVersion ?? node.agentVersion,
      coreVersion: body.coreVersion ?? null,
      reportedAt: safeReportedAt
    })
    .onConflictDoUpdate({
      target: nodeHeartbeats.nodeId,
      set: {
        status: body.status,
        cpu: body.cpu.toFixed(2),
        memory: body.memory.toFixed(2),
        disk: body.disk.toFixed(2),
        netRx: String(body.netRx),
        netTx: String(body.netTx),
        onlineUsers: body.onlineUsers,
        agentVersion: body.agentVersion ?? node.agentVersion,
        coreVersion: body.coreVersion ?? null,
        reportedAt: safeReportedAt
      }
    })

  await db
    .update(nodes)
    .set({
      status: body.status,
      agentVersion: body.agentVersion ?? node.agentVersion,
      lastSeenAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, node.id))

  return ok({
    ack: true,
    configVersion: node.configVersion,
    minAgentVersion: MIN_AGENT_VERSION
  })
})
