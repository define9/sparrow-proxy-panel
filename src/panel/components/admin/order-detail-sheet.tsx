'use client'

import { CheckCircle2, CircleDollarSign, CreditCard, Undo2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { StateBadge } from '@/components/common/state-badge'
import {
  useAdminOrderDetail,
  useCompleteAdminOrder,
  useRefundAdminOrder,
  type AdminOrderRow,
  type AdminOrderTimelineStep
} from '@/lib/api/admin-commerce'
import { paymentMethodLabel } from '@/lib/admin-labels'
import { formatDate, formatMoney } from '@/lib/format'

interface OrderDetailSheetProps {
  order: AdminOrderRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 支付记录状态 → StateBadge 的语义 */
const PAYMENT_RECORD_STATUS: Record<string, string> = {
  success: 'paid',
  refunded: 'refunded',
  failed: 'error',
  pending: 'pending'
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** 详情接口不可用时的兜底时间线，保证抽屉不会空着 */
function fallbackTimeline(order: AdminOrderRow): AdminOrderTimelineStep[] {
  const paid = order.status === 'paid' || order.status === 'refunded'
  return [
    { key: 'created', title: '创建订单', at: order.createdAt, done: true },
    {
      key: 'paid',
      title: paid ? '支付成功' : order.status === 'pending' ? '等待支付' : '支付关闭',
      at: order.paidAt,
      done: paid
    },
    {
      key: 'closed',
      title:
        order.status === 'refunded'
          ? '已退款'
          : order.status === 'paid'
            ? '订单完成'
            : order.status === 'cancelled'
              ? '订单取消'
              : order.status === 'expired'
                ? '订单过期'
                : '待处理',
      at: order.status === 'pending' ? null : (order.paidAt ?? order.createdAt),
      done: order.status !== 'pending'
    }
  ]
}

export function OrderDetailSheet({ order, open, onOpenChange }: OrderDetailSheetProps) {
  const detail = useAdminOrderDetail(order?.id ?? null)
  const complete = useCompleteAdminOrder()
  const refund = useRefundAdminOrder()

  if (!order) return null

  const current = detail.data?.order ?? order
  const timeline = detail.data?.timeline ?? fallbackTimeline(order)
  const records = detail.data?.paymentRecords ?? []
  const busy = complete.isPending || refund.isPending

  function handleComplete() {
    complete.mutate(
      { id: current.id },
      {
        onSuccess: (result) =>
          toast.success(
            result.subscriptionId
              ? `订单 ${current.orderNo} 已完成，订阅已开通`
              : `订单 ${current.orderNo} 已是已支付状态`
          ),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function handleRefund() {
    if (!window.confirm(`确认退款订单 ${current.orderNo}（${formatMoney(current.amount)}）？关联订阅会被取消。`)) {
      return
    }
    refund.mutate(
      { id: current.id },
      {
        onSuccess: () => toast.success(`订单 ${current.orderNo} 已退款`),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            订单详情
            <StateBadge status={current.status} />
          </SheetTitle>
          <SheetDescription className="font-mono tabular-nums">{current.orderNo}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <InfoRow label="用户邮箱">
                  <span className="flex items-center gap-1.5">
                    <User data-icon="inline-start" className="size-3.5 text-muted-foreground" />
                    {current.userEmail}
                  </span>
                </InfoRow>
                <InfoRow label="套餐">{current.planName}</InfoRow>
                <InfoRow label="订单金额">
                  <span className="font-mono tabular-nums">{formatMoney(current.amount)}</span>
                </InfoRow>
                <InfoRow label="优惠金额">
                  <span className="font-mono tabular-nums">{formatMoney(current.discount)}</span>
                </InfoRow>
                <InfoRow label="支付方式">{paymentMethodLabel(current.paymentMethod)}</InfoRow>
                <InfoRow label="交易号">
                  <span className="font-mono text-xs">{current.tradeNo ?? '—'}</span>
                </InfoRow>
                <InfoRow label="创建时间">{formatDate(current.createdAt)}</InfoRow>
                <InfoRow label="过期时间">{formatDate(current.expiresAt)}</InfoRow>
              </dl>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">订单时间线</h3>
            <ol className="flex flex-col gap-3">
              {timeline.map((step, index) => (
                <li key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <CheckCircle2
                      data-icon="inline"
                      className={step.done ? 'size-4 text-success' : 'size-4 text-muted-foreground/50'}
                    />
                    {index < timeline.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border" aria-hidden />
                    ) : null}
                  </div>
                  <div className="flex flex-1 items-start justify-between gap-3 pb-1">
                    <span className="text-sm">{step.title}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {step.at ? formatDate(step.at) : '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <CreditCard data-icon="inline-start" className="size-4 text-muted-foreground" />
              支付记录
            </h3>
            {detail.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : records.length > 0 ? (
              <div className="flex flex-col gap-2">
                {records.map((record) => (
                  <div key={record.id} className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">渠道 / 状态</span>
                      <span className="flex items-center gap-1.5">
                        {paymentMethodLabel(record.gateway)}
                        <StateBadge status={PAYMENT_RECORD_STATUS[record.status] ?? record.status} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">金额</span>
                      <span className="font-mono tabular-nums">{formatMoney(record.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">时间</span>
                      <span className="font-mono tabular-nums">{formatDate(record.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">交易号</span>
                      <span className="font-mono text-xs">{record.tradeNo ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <CircleDollarSign data-icon="inline-start" className="size-4" />
                暂无支付记录，订单尚未支付。
              </p>
            )}
          </section>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={current.status !== 'pending' || busy}
            onClick={handleComplete}
          >
            {complete.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            手动完成
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={current.status !== 'paid' || busy}
            onClick={handleRefund}
          >
            {refund.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Undo2 data-icon="inline-start" />
            )}
            退款
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
