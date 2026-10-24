import type { SubscriptionFormat } from '@sparrow/contracts'
import type { RenderNode, RenderSubscription } from './types'
import { renderClash } from './clash'
import { renderSingbox } from './singbox'
import { renderV2Ray } from './v2ray'

export * from './types'
export * from './limits'
export * from './yaml'
export * from './v2ray'
export * from './clash'
export * from './singbox'
export * from './loader'
export * from './dto'

/**
 * 按格式渲染订阅（统一入口）。
 *
 * 三个渲染器都是纯函数：不访问数据库、不读取配置、不产生副作用。
 */
export function renderSubscription(
  format: SubscriptionFormat,
  subscription: RenderSubscription,
  nodes: RenderNode[]
): string {
  switch (format) {
    case 'clash':
      return renderClash(subscription, nodes)
    case 'singbox':
      return renderSingbox(subscription, nodes)
    case 'v2ray':
    default:
      return renderV2Ray(subscription, nodes)
  }
}
