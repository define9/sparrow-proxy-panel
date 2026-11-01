'use client'

import type { Order } from '@sparrow/contracts'
import type { ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  BellRing,
  Megaphone,
  MonitorSmartphone,
  Package,
  Receipt,
  RefreshCw,
  Rss,
  Wallet
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, queryKeys } from '@/lib/api/client'
import type { OverviewData } from '@/lib/api/types'
import { orderTotal } from '@/lib/billing'
import { formatBytes, formatDate, formatDay, formatMoney } from '@/lib/format'

const orderColumns: ColumnDef<Order, unknown>[] = [
  {
    accessorKey: 'orderNo',
    header: '单号',
    cell: ({ row }) => (
      <Link
        href={`/dashboard/orders/${row.original.orderNo}`}
        className="font-mono text-xs text-primary tabular-nums hover:underline"
      >
        {row.original.orderNo}
      </Link>
    )
  },
  { accessorKey: 'planName', header: '套餐' },
  {
    accessorKey: 'amount',
    header: '金额',
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">{formatMoney(orderTotal(row.original))}</span>
    )
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => <StateBadge status={row.original.status} />
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{formatDate(row.original.createdAt)}</span>
    )
  }
]

const shortcuts = [
  {
    href: '/dashboard/plans',
    label: '选购套餐',
    description: '流量包与时长包，支持随时升级',
    icon: Package
  },
  {
    href: '/dashboard/orders',
    label: '我的订单',
    description: '查看支付状态与历史订单',
    icon: Receipt
  },
  {
    href: '/dashboard/subscriptions',
    label: '我的订阅',
    description: '订阅链接、二维码与设备管理',
    icon: Rss
  },
  {
    href: '/dashboard/traffic',
    label: '流量统计',
    description: '按日用量与节点明细',
    icon: Activity
  }
]

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-lg xl:col-span-2" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  )
}

export default function DashboardPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => apiFetch<OverviewData>('/api/v1/user/overview')
  })

  const subscription = data?.subscription ?? null
  const quota = data?.quota
  const traffic = data?.traffic

  return (
    <>
      <PageHeader
        title="概览"
        description={`欢迎回来，${data?.account.username ?? '用户'}。这里是你的套餐、流量与最近订单。`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                void refetch()
                toast.success('已刷新')
              }}
            >
              <RefreshCw data-icon aria-hidden="true" />
              刷新
            </Button>
            <Button asChild>
              <Link href="/dashboard/plans">
                <Package data-icon aria-hidden="true" />
                续费 / 选购
              </Link>
            </Button>
          </>
        }
      />

      {isPending ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorState description="概览数据加载失败，请稍后重试。" onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="当前套餐"
              value={subscription?.planName ?? '未开通'}
              hint={
                subscription ? `到期 ${formatDay(subscription.expireAt)}` : '选购套餐后自动开通'
              }
              icon={Package}
            />
            <StatCard
              label="剩余流量"
              value={formatBytes(quota?.remaining ?? 0, 1)}
              hint={`总量 ${quota && quota.limit > 0 ? formatBytes(quota.limit, 0) : '不限'}`}
              icon={Activity}
            />
            <StatCard
              label="在线设备"
              value={`${data?.devices.online ?? 0} / ${data?.devices.limit ?? 0}`}
              hint="达到上限后新设备无法连接"
              icon={MonitorSmartphone}
            />
            <StatCard
              label="账户余额"
              value={formatMoney(data?.account.balance ?? '0.00')}
              hint="可用于续费与升级"
              icon={Wallet}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle>本期流量</CardTitle>
                    <CardDescription>
                      {subscription
                        ? `${subscription.planName} · 流量按订阅周期重置，用尽后自动暂停`
                        : '还没有生效中的订阅'}
                    </CardDescription>
                  </div>
                  {subscription ? <StateBadge status={subscription.status} /> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {subscription ? (
                  <>
                    <QuotaBar used={quota?.used ?? 0} limit={quota?.limit ?? 0} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">下载</span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatBytes(subscription.download, 1)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">上传</span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatBytes(subscription.upload, 1)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">到期时间</span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatDay(subscription.expireAt)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={Package}
                    title="还没有订阅"
                    description="购买套餐并完成支付后，订阅会自动开通。"
                    action={
                      <Button asChild>
                        <Link href="/dashboard/plans">去选购</Link>
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Megaphone className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
                  <CardTitle>公告</CardTitle>
                </div>
                <CardDescription>线路与运营动态</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.announcements.length > 0 ? (
                  <ul className="flex flex-col gap-4">
                    {data.announcements.map((item) => (
                      <li key={item.id} className="flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                          <BellRing
                            className={cn(
                              'mt-0.5 size-3.5 shrink-0',
                              item.level === 'warn' ? 'text-warning' : 'text-info'
                            )}
                            data-icon
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.content}</p>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatDate(item.publishedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无公告</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle>最近订单</CardTitle>
                  <CardDescription>最近 3 笔订单，点击单号查看详情</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/orders">
                    全部订单
                    <ArrowUpRight data-icon aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={orderColumns}
                data={data?.recentOrders ?? []}
                emptyTitle="还没有订单"
                emptyDescription="选购套餐后，订单会出现在这里。"
              />
            </CardContent>
          </Card>

          {traffic && traffic.monthUsed > 0 ? (
            <p className="text-xs text-muted-foreground">
              近 30 天合计使用 {formatBytes(traffic.monthUsed, 1)}，日均{' '}
              {formatBytes(traffic.dailyAverage, 1)}。
            </p>
          ) : null}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((shortcut) => (
          <Link key={shortcut.href} href={shortcut.href} className="group">
            <Card className="h-full gap-3 transition-colors group-hover:bg-muted/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                    <shortcut.icon className="size-4" data-icon aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    data-icon
                    aria-hidden="true"
                  />
                </div>
                <CardTitle className="text-base">{shortcut.label}</CardTitle>
                <CardDescription>{shortcut.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
