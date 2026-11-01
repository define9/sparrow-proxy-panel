import { NextResponse } from 'next/server'
import { route } from '@/lib/api/response'
import { authenticateAgent } from '@/lib/agent/auth'
import { buildNodeConfig } from '@/lib/agent/config'

/**
 * 拉取节点配置。
 * 头部 X-Config-Version 与当前一致时返回 304（弱网下省流量）。
 */
export const GET = route(async (req: Request) => {
  const { node } = await authenticateAgent(req)

  const clientVersion = req.headers.get('x-config-version')
  if (clientVersion !== null && Number(clientVersion) === node.configVersion) {
    return new NextResponse(null, {
      status: 304,
      headers: { 'X-Config-Version': String(node.configVersion) }
    })
  }

  const payload = await buildNodeConfig(node)

  return NextResponse.json(payload, {
    headers: { 'X-Config-Version': String(node.configVersion) }
  })
})
