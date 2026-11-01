import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { balanceAdjustSchema, numeric, parseAmount } from '@/lib/api/admin-ops'

type Ctx = { params: Promise<{ id: string }> }

export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:balance')
  const { id } = await ctx.params
  const body = balanceAdjustSchema.parse(await req.json())

  const amount = parseAmount(body.amount)
  if (amount === null) {
    throw new ApiError(422, 'USER_BALANCE_AMOUNT_INVALID', '调整金额需为非 0 数字，最多两位小数')
  }

  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const next = Math.round((numeric(current.balance) + amount) * 100) / 100
  if (next < 0) {
    throw new ApiError(422, 'USER_BALANCE_INSUFFICIENT', '调整后余额不能小于 0')
  }

  const [updated] = await db
    .update(users)
    .set({ balance: next.toFixed(2), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()

  const sign = amount > 0 ? '+' : ''
  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'user.balance',
      targetType: 'user',
      targetId: id,
      message: `调整用户 ${current.email} 余额 ${sign}${amount.toFixed(2)}：${body.reason}`,
      meta: { before: current.balance, after: updated.balance, amount, reason: body.reason }
    }
  )

  return ok({ id, balance: numeric(updated.balance).toFixed(2) })
})
