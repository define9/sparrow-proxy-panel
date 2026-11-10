import { ok, route } from '@/lib/api/response'
import { getAgentRelease } from '@/lib/services/agent-release'

/**
 * Agent 发布元信息（公开，无需登录）。
 *
 * 面板**不存储**任何发布数据：这里实时（带 TTL 缓存）代理 GitHub Release，
 * 把最新 `agent/v*` 的资产整理成 { 平台: { url, sha256 } }。
 * 二进制本体由节点直接从 GitHub 下载，面板不托管。
 *
 * GitHub 不可达 / 限流时返回 503（错误信息给出 --manifest / --from-url 出路）；
 * Release 里没有可用资产时返回 source: 'none' + 空 assets。
 */
export const GET = route(async () =>
  ok(await getAgentRelease(), {
    headers: { 'cache-control': 'public, max-age=60' }
  })
)
