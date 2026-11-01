'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Receipt, RotateCcw, ShoppingCart, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/common/copy-button'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { InfoItem, InfoList } from '@/components/user/info-list'
import { OrderTimeline } from '@/components/user/order-timeline'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatMoney } from '@/lib/format'
import { orders } from '@/lib/mock/catalog'
import { orderTotal, paymentMethodLabel } from '@/lib/mock/user-data'

export default function OrderDetailPage() {
  const params = useParams<{ orderNo: string }>()
  const order = orders.find((item) => item.orderNo === params.orderNo)

  if (!order) {
    return (
      <EmptyState
        icon={Receipt}
        title="订单不存在"
        description="该订单号没有匹配的记录，请返回订单列表重新选择。"
        action={
          <Button asChild>
            <Link href="/dashboard/orders">返回订单列表</Link>
          </Button>
        }
      />
    )
  }

  const discount = Number(order.discount)
  const total = orderTotal(order)

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/orders">订单</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{order.orderNo}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={`订单 ${order.orderNo}`}
        description={`${order.planName} · 创建于 ${formatDate(order.createdAt)}`}
        actions={
          <>
            <StateBadge status={order.status} />
            <CopyButton value={order.orderNo} label="复制单号" />
            <Button asChild variant="outline">
              <Link href="/dashboard/orders">
                <ArrowLeft data-icon aria-hidden="true" />
                返回列表
              </Link>
            </Button>
          </>
        }
      />

      {order.status === 'pending' ? (
        <Alert>
          <XCircle data-icon aria-hidden="true" />
          <AlertTitle>订单待支付</AlertTitle>
          <AlertDescription>
            请在 {formatDate(order.expiresAt)} 前完成支付，超时后订单会自动关闭。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>订单内容与金额明细</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoList>
                <InfoItem label="订单号" mono>
                  {order.orderNo}
                </InfoItem>
                <InfoItem label="商品">
                  <Link
                    href={`/dashboard/plans/${order.planId}`}
                    className="text-primary hover:underline"
                  >
                    {order.planName}
                  </Link>
                </InfoItem>
                <InfoItem label="数量" mono>
                  1
                </InfoItem>
                <InfoItem label="订单状态">
                  <StateBadge status={order.status} />
                </InfoItem>
                <InfoItem label="订单金额" mono>
                  {formatMoney(order.amount)}
                </InfoItem>
                <InfoItem label="优惠金额" mono>
                  {discount > 0 ? `- ${formatMoney(discount)}` : '—'}
                </InfoItem>
                <InfoItem label="实付金额" mono>
                  <span className="text-base font-semibold">{formatMoney(total)}</span>
                </InfoItem>
                <InfoItem label="创建时间" mono>
                  {formatDate(order.createdAt)}
                </InfoItem>
                <InfoItem label="支付截止时间" mono>
                  {formatDate(order.expiresAt)}
                </InfoItem>
                <InfoItem label="下单账号">{order.userEmail}</InfoItem>
              </InfoList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>订单进度</CardTitle>
              <CardDescription>从创建到开通订阅的完整流程</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderTimeline order={order} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>支付信息</CardTitle>
              <CardDescription>由支付插件回调写入</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoList className="grid-cols-1 sm:grid-cols-1">
                <InfoItem label="支付方式">{paymentMethodLabel(order.paymentMethod)}</InfoItem>
                <InfoItem label="交易号" mono>
                  {order.tradeNo ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {order.tradeNo}
                      <CopyButton value={order.tradeNo} label="复制" />
                    </span>
                  ) : (
                    '—'
                  )}
                </InfoItem>
                <InfoItem label="支付时间" mono>
                  {formatDate(order.paidAt)}
                </InfoItem>
                <InfoItem label="退款状态">
                  {order.status === 'refunded' ? '已退款至原渠道' : '无退款'}
                </InfoItem>
              </InfoList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>操作</CardTitle>
              <CardDescription>演示环境不会发起真实请求</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/dashboard/plans">
                  <ShoppingCart data-icon aria-hidden="true" />
                  再次购买
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => toast.info('演示环境：订单支付接口未接入')}
              >
                <RotateCcw data-icon aria-hidden="true" />
                重新支付
              </Button>
              <Separator className="my-1" />
              <Button
                variant="destructive"
                className="w-full"
                disabled={order.status !== 'pending'}
                onClick={() => toast.info('演示环境：订单取消接口未接入')}
              >
                <XCircle data-icon aria-hidden="true" />
                取消订单
              </Button>
              <p className="text-xs text-muted-foreground">
                已支付订单如需退款，请通过工单联系我们。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
