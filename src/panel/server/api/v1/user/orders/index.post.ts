import { CreateOrderSchema } from '@sparrow/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { orders, plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import {
  ORDER_EXPIRY_MINUTES,
  centsToMoney,
  generateOrderNo,
  isOrderExpired,
  moneyToCents,
  orderQuantity,
  releasePlanStock,
  reservePlanStock,
  toOrderView,
  transitionOrderStatus
} from '../../../../utils/order'
import type { OrderRow } from '../../../../utils/order'
import { isPlanInStock } from '../../../../utils/plan'
import { requireSessionUser } from '../../../../utils/session-user'
import { validateBody } from '../../../../utils/validate'

/**
 * POST /api/v1/user/orders
 *
 * 下单：创建 pending 订单并锁定库存（stock - 1）。
 * - expires_at 默认下单时间 + 30 分钟
 * - 幂等：同一用户同一商品存在未过期的 pending 订单时，直接返回该订单
 */
export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event)
  const body = await validateBody(event, CreateOrderSchema)

  const db = useDb()

  const result = await db.transaction(async (tx): Promise<{
    order: OrderRow
    idempotent: boolean
    planName: string
  }> => {
    // 锁住商品行，串行化同一商品的下单与库存扣减
    const [plan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.id, body.planId))
      .for('update')

    if (!plan) {
      throw createError({
        statusCode: 404,
        statusMessage: 'PLAN_NOT_FOUND',
        message: '商品不存在',
        data: { code: 'PLAN_NOT_FOUND', message: '商品不存在' }
      })
    }

    if (plan.status !== 'active') {
      throw createError({
        statusCode: 409,
        statusMessage: 'PLAN_INACTIVE',
        message: '商品未上架',
        data: { code: 'PLAN_INACTIVE', message: '商品未上架' }
      })
    }

    // 幂等：同一用户 + 同一商品 + pending
    const [existing] = await tx
      .select()
      .from(orders)
      .where(and(
        eq(orders.userId, user.id),
        eq(orders.planId, plan.id),
        eq(orders.status, 'pending')
      ))
      .orderBy(desc(orders.createdAt))
      .limit(1)

    if (existing) {
      if (!isOrderExpired(existing)) {
        return { order: existing, idempotent: true, planName: plan.name }
      }

      // 上一笔待支付订单已过期：先关闭并释放库存，再新建
      await transitionOrderStatus(tx, existing, 'expired')
      await releasePlanStock(tx, existing.planId, orderQuantity(existing))
    }

    if (!isPlanInStock({ stock: plan.stock }, body.quantity)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'PLAN_OUT_OF_STOCK',
        message: '商品库存不足',
        data: { code: 'PLAN_OUT_OF_STOCK', message: '商品库存不足' }
      })
    }

    const reserved = await reservePlanStock(tx, plan.id, body.quantity)
    if (!reserved) {
      throw createError({
        statusCode: 409,
        statusMessage: 'PLAN_OUT_OF_STOCK',
        message: '商品库存不足',
        data: { code: 'PLAN_OUT_OF_STOCK', message: '商品库存不足' }
      })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + ORDER_EXPIRY_MINUTES * 60_000)
    const amount = centsToMoney(moneyToCents(plan.price) * body.quantity)

    const [created] = await tx
      .insert(orders)
      .values({
        orderNo: generateOrderNo(now),
        userId: user.id,
        planId: plan.id,
        amount,
        discount: '0.00',
        currency: plan.currency,
        status: 'pending',
        expiresAt,
        meta: {
          planName: plan.name,
          planSlug: plan.slug,
          planType: plan.type,
          unitPrice: plan.price,
          quantity: body.quantity,
          durationDays: plan.durationDays,
          trafficGb: plan.trafficGb,
          deviceLimit: plan.deviceLimit,
          speedLimitMbps: plan.speedLimitMbps
        }
      })
      .returning()

    if (!created) {
      throw createError({
        statusCode: 500,
        statusMessage: 'INTERNAL_ERROR',
        message: '订单创建失败',
        data: { code: 'INTERNAL_ERROR', message: '订单创建失败' }
      })
    }

    return { order: created, idempotent: false, planName: plan.name }
  })

  return {
    data: toOrderView(result.order, { planName: result.planName }),
    idempotent: result.idempotent
  }
})
