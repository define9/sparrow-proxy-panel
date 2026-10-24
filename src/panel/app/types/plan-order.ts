import type { Order, Plan } from '@sparrow/contracts'

/**
 * 商品与订单的前端类型。
 *
 * 与契约 `@sparrow/contracts` 对齐；
 * `updatedAt` / `userEmail` 已由协调者补入契约（`OrderSchema`）。
 */
export interface OrderView extends Order {
  userEmail?: string | null
}

/** 下单响应：附带幂等标记 */
export interface CreateOrderResponse {
  data: OrderView
  idempotent: boolean
}

/** 管理端手动完成订单的响应：附带未实现部分的说明 */
export interface CompleteOrderResponse {
  data: OrderView
  todo?: {
    subscription?: string
  }
}

/** 商品列表响应 */
export interface PlanListResponse {
  data: Plan[]
  meta: {
    total: number
    page: number
    pageSize: number
    hasMore: boolean
    nextCursor: string | null
  }
}

/** 订单列表响应 */
export interface OrderListResponse {
  data: OrderView[]
  meta: {
    total: number
    page: number
    pageSize: number
    hasMore: boolean
    nextCursor: string | null
  }
}
