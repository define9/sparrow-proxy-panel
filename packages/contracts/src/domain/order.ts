import { z } from 'zod'
import { CurrencySchema, DateTimeSchema, IdSchema, MoneySchema } from '../common'

export const OrderStatusSchema = z.enum(['pending', 'paid', 'cancelled', 'expired', 'refunded'])
export type OrderStatus = z.infer<typeof OrderStatusSchema>

export const OrderSchema = z.object({
  id: IdSchema,
  orderNo: z.string(),
  userId: IdSchema,
  planId: IdSchema,
  planName: z.string(),
  amount: MoneySchema,
  discount: MoneySchema,
  currency: CurrencySchema,
  status: OrderStatusSchema,
  paymentMethod: z.string().nullish(),
  tradeNo: z.string().nullish(),
  expiresAt: DateTimeSchema.nullish(),
  paidAt: DateTimeSchema.nullish(),
  createdAt: DateTimeSchema
})
export type Order = z.infer<typeof OrderSchema>

export const CreateOrderSchema = z.object({
  planId: IdSchema,
  couponCode: z.string().trim().optional(),
  quantity: z.number().int().min(1).max(10).default(1)
})
export type CreateOrder = z.infer<typeof CreateOrderSchema>

export const OrderFilterSchema = z.object({
  status: OrderStatusSchema.optional(),
  userId: IdSchema.optional(),
  planId: IdSchema.optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional()
})
export type OrderFilter = z.infer<typeof OrderFilterSchema>
