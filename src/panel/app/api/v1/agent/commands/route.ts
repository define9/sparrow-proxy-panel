import { ok, route } from '@/lib/api/response'
import { authenticateAgent } from '@/lib/agent/auth'
import { listPendingCommands } from '@/lib/services/agent'

/**
 * Agent 长轮询待执行命令。
 * ?wait=25 表示最多挂起 25 秒（单机部署用 DB 轮询实现，见 service）。
 */
export const GET = route(async (req: Request) => {
  const { node } = await authenticateAgent(req)
  const raw = new URL(req.url).searchParams.get('wait')
  const wait = Number(raw)

  const commands = await listPendingCommands(
    node.id,
    Number.isFinite(wait) && wait > 0 ? wait : 25
  )

  return ok({ commands })
})
