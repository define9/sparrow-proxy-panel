'use client'

import type { Order, OrderStatus } from '@sparrow/contracts'
import { CheckCircle2, CircleDollarSign, CreditCard, RotateCcw, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { StateBadge } from '@/components/common/state-badge'
import { formatDate, formatMoney } from '@/lib/format'
import { paymentMethodLabel } from '@/lib/mock/admin-catalog'

interface OrderDetailSheetProps {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (orderId: string, status: OrderStatus) => void
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function OrderDetailSheet({ order, open, onOpenChange, onStatusChange }: OrderDetailSheetProps) {
  if (!order) return null

  const currentOrder = order
  const paid = order.status === 'paid' || order.status === 'refunded'
  const closed = order.status === 'cancelled' || order.status === 'expired'
  const timeline = [
    { title: '创建订单', time: formatDate(order.createdAt), done: true },
    {
      title: paid ? '支付成功' : order.status === 'pending' ? '等待支付' : '支付关闭',
      time: order.paidAt ? formatDate(order.paidAt) : paid ? '—' : '未支付',
      done: paid
    },
    {
      title: closed ? '订单关闭' : order.status === 'refunded' ? '已退款' : '订单完成',
      time: closed || order.status === 'refunded' || order.status === 'paid' ? formatDate(order.paidAt ?? order.createdAt) : '待处理',
      done: paid || closed
    }
  ]

  function complete() {
    onStatusChange(currentOrder.id, 'paid')
    toast.success(`订单 ${currentOrder.orderNo} 已标记为已支付`)
  }

  function refund() {
    onStatusChange(currentOrder.id, 'refunded')
    toast.success(`订单 ${currentOrder.orderNo} 已退款`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            订单详情
            <StateBadge status={order.status} />
          </SheetTitle>
          <SheetDescription className="font-mono tabular-nums">{order.orderNo}</SheetDescription>
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
                    {order.userEmail}
                  </span>
                </InfoRow>
                <InfoRow label="套餐">{order.planName}</InfoRow>
                <InfoRow label="订单金额">
                  <span className="font-mono tabular-nums">{formatMoney(order.amount)}</span>
                </InfoRow>
                <InfoRow label="优惠金额">
                  <span className="font-mono tabular-nums">{formatMoney(order.discount)}</span>
                </InfoRow>
                <InfoRow label="支付方式">{paymentMethodLabel(order.paymentMethod)}</InfoRow>
                <InfoRow label="交易号">
                  <span className="font-mono text-xs">{order.tradeNo ?? '—'}</span>
                </InfoRow>
                <InfoRow label="创建时间">{formatDate(order.createdAt)}</InfoRow>
                <InfoRow label="过期时间">{formatDate(order.expiresAt)}</InfoRow>
              </dl>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">订单时间线</h3>
            <ol className="flex flex-col gap-3">
              {timeline.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <CheckCircle2
                      data-icon="inline"
                      className={
                        step.done
                          ? 'size-4 text-success'
                          : 'size-4 text-muted-foreground/50'
                      }
                    />
                    {index < timeline.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border" aria-hidden />
                    ) : null}
                  </div>
                  <div className="flex flex-1 items-start justify-between gap-3 pb-1">
                    <span className="text-sm">{step.title}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{step.time}</span>
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
            {order.tradeNo ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">支付渠道</span>
                  <span>{paymentMethodLabel(order.paymentMethod)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">支付金额</span>
                  <span className="font-mono tabular-nums">{formatMoney(order.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">支付时间</span>
                  <span className="font-mono tabular-nums">{formatDate(order.paidAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">交易号</span>
                  <span className="font-mono text-xs">{order.tradeNo}</span>
                </div>
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
          <Button variant="outline" size="sm" disabled={order.status !== 'pending'} onClick={complete}>
            <CheckCircle2 data-icon="inline-start" />
            手动完成
          </Button>
          <Button variant="destructive" size="sm" disabled={order.status !== 'paid'} onClick={refund}>
            <RotateCcw data-icon="inline-start" />
            退款
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
