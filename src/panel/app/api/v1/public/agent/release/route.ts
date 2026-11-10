import { ok, route } from '@/lib/api/response'
import { getAgentRelease } from '@/lib/services/agent-release'

/**
 * Agent 发布元信息（公开，无需登录）。
 *
 * 节点 / install.sh 从这里拿二进制地址与 sha256，二进制本体在 GitHub Release
 * （或面板配置的 CDN），面板不托管。未配置发布源时返回 source: 'none'，不是 500。
 */
export const GET = route(async () =>
  ok(await getAgentRelease(), {
    headers: { 'cache-control': 'public, max-age=60' }
  })
)
