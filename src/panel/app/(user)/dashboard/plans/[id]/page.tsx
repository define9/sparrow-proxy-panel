'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Clock,
  Gauge,
  MonitorSmartphone,
  PackageSearch,
  ShoppingCart,
  Wifi
} from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, ApiClientError, queryKeys } from '@/lib/api/client'
import type { Order, Plan } from '@/lib/api/types'
import { planBenefits } from '@/lib/billing'
import { formatMoney } from '@/lib/format'

const TYPE_LABELS: Record<string, string> = {
  traffic: '流量包',
  time: '时长包',
  bandwidth: '带宽包'
}

function PlanDetailSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Skeleton className="h-96 rounded-xl lg:col-span-2" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: plan, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.plan(params.id),
    queryFn: () => apiFetch<Plan>(`/api/v1/user/plans/${params.id}`),
    retry: false
  })

  const createOrder = useMutation({
    mutationFn: (planId: string) =>
      apiFetch<Order>('/api/v1/user/orders', { method: 'POST', body: { planId } }),
    onSuccess: (order) => {
      toast.success('下单成功，请在订单页完成支付')
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
      router.push(`/dashboard/orders/${order.orderNo}`)
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof ApiClientError ? mutationError.message : '下单失败，请稍后重试'
      )
    }
  })

  const notFound = error instanceof ApiClientError && error.statusCode === 404

  if (isPending) {
    return (
      <>
        <PageHeader title="商品详情" description="正在加载商品信息…" />
        <PlanDetailSkeleton />
      </>
    )
  }

  if (notFound) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="商品不存在或已下架"
        description="该商品可能已停售，去看看其他可用套餐。"
        action={
          <Button asChild>
            <Link href="/dashboard/plans">返回商品列表</Link>
          </Button>
        }
      />
    )
  }

  if (isError || !plan) {
    return <ErrorState description="商品详情加载失败，请稍后重试。" onRetry={() => void refetch()} />
  }

  const available = plan.status === 'active' && (plan.stock === null || plan.stock > 0)
  const benefits = planBenefits(plan)
  const discount = plan.originalPrice ? Number(plan.originalPrice) - Number(plan.price) : 0

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/plans">商品</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{plan.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={plan.name}
        description={plan.description}
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/plans">
              <ArrowLeft data-icon aria-hidden="true" />
              返回商品列表
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{TYPE_LABELS[plan.type] ?? plan.type}</Badge>
              {plan.isHot ? <Badge>热销</Badge> : null}
              {plan.tags
                .filter((tag) => tag !== '热销')
                .map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              {available ? (
                <Badge variant="success">在售</Badge>
              ) : (
                <Badge variant="secondary">已售罄</Badge>
              )}
            </div>
            <CardTitle className="mt-2">商品说明</CardTitle>
            <CardDescription>
              {plan.description}。适合需要稳定国际线路的个人与小团队，开通后立即生效。
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">包含权益</h2>
              <ul className="flex flex-col gap-2.5">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success"
                      data-icon
                      aria-hidden="true"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">规格</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                <li className="flex items-center gap-2 text-sm">
                  <Wifi className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
                  <span className="text-muted-foreground">周期流量</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {plan.trafficGb > 0 ? `${plan.trafficGb} GB` : '不限量'}
                  </span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
                  <span className="text-muted-foreground">有效期</span>
                  <span className="ml-auto font-mono tabular-nums">{plan.durationDays} 天</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <MonitorSmartphone
                    className="size-4 text-muted-foreground"
                    data-icon
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">设备上限</span>
                  <span className="ml-auto font-mono tabular-nums">{plan.deviceLimit} 台</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Gauge className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
                  <span className="text-muted-foreground">峰值带宽</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {plan.speedLimitMbps > 0 ? `${plan.speedLimitMbps} Mbps` : '不限速'}
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>价格</CardTitle>
            <CardDescription>下单后 2 小时内完成支付，超时自动关闭</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold tabular-nums">
                {formatMoney(plan.price)}
              </span>
              {plan.originalPrice ? (
                <span className="font-mono text-sm text-muted-foreground line-through tabular-nums">
                  {formatMoney(plan.originalPrice)}
                </span>
              ) : null}
              {discount > 0 ? <Badge variant="success">省 {formatMoney(discount)}</Badge> : null}
            </div>

            <Separator />

            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">库存</span>
                <span className="font-mono tabular-nums">
                  {plan.stock === null ? '不限' : plan.stock > 0 ? `${plan.stock} 件` : '已售罄'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">已售</span>
                <span className="font-mono tabular-nums">
                  {plan.soldCount.toLocaleString('zh-CN')}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">商品编号</span>
                <span className="font-mono text-xs tabular-nums">{plan.id}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">开通方式</span>
                <span>支付后自动开通</span>
              </li>
            </ul>

            <Button
              className="w-full"
              disabled={!available || createOrder.isPending}
              onClick={() => createOrder.mutate(plan.id)}
            >
              <ShoppingCart data-icon aria-hidden="true" />
              {available ? (createOrder.isPending ? '正在下单…' : '立即购买') : '已售罄'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => toast.info('工单系统尚未接入')}
            >
              咨询客服
            </Button>

            <p className="text-xs text-muted-foreground">
              支付成功后订阅自动开通，可在「订阅」页复制链接导入客户端。
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
