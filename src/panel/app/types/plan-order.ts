import type { Order, Plan } from '@sparrow/contracts'

/**
 * 商品与订单的前端类型。
 *
 * 与契约 `@sparrow/contracts` 对齐，额外补充两个便利字段
 * （契约里没有，需要协调者统一处理）：
 * - `OrderView.updatedAt`：列表排序与后台展示需要
 * - `OrderView.userEmail`：管理端按用户筛选时直接展示
 */
export interface OrderView extends Order {
  updatedAt: string
  userEmail: string | null
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
