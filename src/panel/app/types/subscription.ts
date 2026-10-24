import type { QuotaState, Subscription } from '@sparrow/contracts'

/** 订阅列表项：契约字段 + 配额状态 */
export interface SubscriptionListItem extends Subscription {
  quota: QuotaState
}

/** 列表响应（与契约 paginated(SubscriptionSchema) 兼容，额外带 quota） */
export interface SubscriptionListResponse {
  data: SubscriptionListItem[]
  meta: {
    total: number
    page: number
    pageSize: number
    hasMore: boolean
    nextCursor: string | null
  }
}

/** 订阅详情：契约字段 + 配额、订阅链接、白名单、节点数 */
export interface SubscriptionDetail extends Subscription {
  quota: QuotaState
  urls: Record<string, string>
  ipWhitelist: string[]
  nodeCount: number
}
