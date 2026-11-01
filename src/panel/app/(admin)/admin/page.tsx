'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  CreditCard,
  Megaphone,
  Receipt,
  Rss,
  Server,
  Users
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { apiFetch, queryKeys } from '@/lib/api/client'
import { fetchOptional, unwrapList } from '@/lib/api/optional'
import { formatBytes, formatDate, formatMoney, formatRelative } from '@/lib/format'

interface OverviewStats {
  users: { total: number; newToday: number }
  revenue: { today: string; month: string }
  orders: { today: number; pending: number }
  subscriptions: { active: number; expiring: number }
  nodes: { total: number; online: number }
  traffic: { today: number; month: number }
}

interface TrafficPoint {
  date: string
  upload: number
  download: number
  total: number
}

interface RevenuePoint {
  date: string
  amount: number
}

interface SiteAnnouncement {
  id: string
  title: string
  content: string
  level: 'info' | 'warn' | 'error'
  publishedAt: string
}

interface SiteConfig {
  name: string
  announcement: string
  announcements: SiteAnnouncement[]
}

interface RecentOrder {
  id?: string
  orderNo: string
  userEmail: string
  planName: string
  amount: string | number
  status: string
  createdAt: string
}

interface AdminNode {
  id: string
  name: string
  groupName?: string
  status: string
  onlineUsers?: number
}

const revenueConfig = {
  revenue: { label: '实收金额', color: 'var(--chart-1)' }
} satisfies ChartConfig

const trafficConfig = {
  traffic: { label: '流量', color: 'var(--chart-2)' }
} satisfies ChartConfig

const recentOrderColumns: ColumnDef<RecentOrder, unknown>[] = [
  {
    accessorKey: 'orderNo',
    header: '单号',
    cell: ({ row }) => <span className="font-mono text-xs tabular-nums">{row.original.orderNo}</span>
  },
  {
    accessorKey: 'userEmail',
    header: '用户',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.userEmail}</span>
  },
  { accessorKey: 'planName', header: '套餐' },
  {
    accessorKey: 'amount',
    header: '金额',
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">{formatMoney(row.original.amount)}</span>
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
      <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
    )
  }
]

function dayLabel(date: string) {
  return date.slice(5)
}

export default function AdminDashboardPage() {
  const overview = useQuery({
    queryKey: queryKeys.stats('overview'),
    queryFn: () => apiFetch<OverviewStats>('/api/v1/admin/stats/overview'),
    refetchInterval: 60_000
  })

  const revenue = useQuery({
    queryKey: queryKeys.stats('revenue-14'),
    queryFn: () => apiFetch<RevenuePoint[]>('/api/v1/admin/stats/revenue?days=14')
  })

  const traffic = useQuery({
    queryKey: queryKeys.stats('traffic-14'),
    queryFn: () => apiFetch<TrafficPoint[]>('/api/v1/admin/stats/traffic?days=14')
  })

  const site = useQuery({
    queryKey: ['site'],
    queryFn: () => fetchOptional<SiteConfig>('/api/v1/public/site')
  })

  // 订单/节点列表由其他任务提供，未就绪时回退到空列表
  const recentOrders = useQuery({
    queryKey: queryKeys.orders({ scope: 'dashboard', pageSize: 5 }),
    queryFn: () => fetchOptional<unknown>('/api/v1/admin/orders?pageSize=5')
  })

  const nodeList = useQuery({
    queryKey: queryKeys.nodes({ scope: 'dashboard' }),
    queryFn: () => fetchOptional<unknown>('/api/v1/admin/nodes?pageSize=8')
  })

  const stats = overview.data
  const revenueSeries = (revenue.data ?? []).map((point) => ({
    label: dayLabel(point.date),
    revenue: Number(point.amount)
  }))
  const revenueTotal = revenueSeries.reduce((sum, point) => sum + point.revenue, 0)

  const trafficSeries = (traffic.data ?? []).map((point) => ({
    label: dayLabel(point.date),
    traffic: Number((point.total / 1024 ** 3).toFixed(2))
  }))
  const trafficTotal = (traffic.data ?? []).reduce((sum, point) => sum + point.total, 0)

  const orders = unwrapList<RecentOrder>(recentOrders.data).slice(0, 5)
  const nodes = unwrapList<AdminNode>(nodeList.data)
  const announcements = site.data?.announcements ?? []

  const nodeTotal = stats?.nodes.total ?? 0
  const nodeOnline = stats?.nodes.online ?? 0
  const nodeOffline = Math.max(nodeTotal - nodeOnline, 0)

  return (
    <>
      <PageHeader
        title="仪表盘"
        description="平台运营概览：收入、订单、订阅与节点状态"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/orders">
              查看全部订单
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="用户总数"
          value={stats ? stats.users.total.toLocaleString('zh-CN') : '—'}
          hint={stats ? `今日新增 ${stats.users.newToday.toLocaleString('zh-CN')}` : '加载中…'}
          icon={Users}
        />
        <StatCard
          label="今日收入"
          value={stats ? formatMoney(stats.revenue.today) : '—'}
          hint={stats ? `本月 ${formatMoney(stats.revenue.month)}` : '加载中…'}
          icon={CreditCard}
        />
        <StatCard
          label="今日订单"
          value={stats ? stats.orders.today.toLocaleString('zh-CN') : '—'}
          hint={stats ? `${stats.orders.pending} 笔待支付` : '加载中…'}
          icon={Receipt}
        />
        <StatCard
          label="活跃订阅"
          value={stats ? stats.subscriptions.active.toLocaleString('zh-CN') : '—'}
          hint={stats ? `${stats.subscriptions.expiring} 个 7 天内到期` : '加载中…'}
          icon={Rss}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>收入趋势</CardTitle>
            <CardDescription>
              近 14 天实收金额，合计 {formatMoney(revenueTotal.toFixed(2))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenueConfig} className="aspect-auto h-64 w-full">
              <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value: number) => `¥${Math.round(value)}`}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  dataKey="revenue"
                  type="natural"
                  fill="url(#fillRevenue)"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>节点在线概览</CardTitle>
            <CardDescription>
              共 {nodeTotal} 个节点，实时在线 {nodeOnline} 个
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-success">
                  {nodeOnline}
                </span>
                <span className="text-sm text-muted-foreground">/ {nodeTotal} 在线</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StateBadge status="offline" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {nodeOffline}
                </span>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {nodes.slice(0, 4).map((node) => (
                <li
                  key={node.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Server data-icon="inline-start" className="size-4 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-sm">{node.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {node.groupName ?? '未分组'} · {node.onlineUsers ?? 0} 人在线
                      </span>
                    </div>
                  </div>
                  <StateBadge status={node.status} />
                </li>
              ))}
              {nodes.length === 0 ? (
                <li className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  暂无节点明细，节点列表接口就绪后自动展示。
                </li>
              ) : null}
            </ul>
            <Button asChild variant="ghost" size="sm" className="justify-between">
              <Link href="/admin/nodes">
                全部节点
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>流量趋势</CardTitle>
            <CardDescription>
              近 14 天按日聚合，合计 {formatBytes(trafficTotal, 1)}
              {stats ? ` · 今日 ${formatBytes(stats.traffic.today, 1)}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trafficConfig} className="aspect-auto h-64 w-full">
              <AreaChart data={trafficSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fillTraffic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-traffic)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-traffic)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(value: number) => `${value} GB`}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  dataKey="traffic"
                  type="natural"
                  fill="url(#fillTraffic)"
                  stroke="var(--color-traffic)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
            {trafficSeries.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无流量数据，Agent 上报后自动汇总。</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone data-icon="inline-start" className="size-4 text-muted-foreground" />
              站点公告
            </CardTitle>
            <CardDescription>面向全部用户展示的运维通知</CardDescription>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无公告。</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {announcements.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={item.level === 'info' ? 'info' : 'warning'}>
                          {item.level === 'info' ? '动态' : '运维'}
                        </Badge>
                        <span className="text-sm font-medium">{item.title}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(item.publishedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近订单</CardTitle>
          <CardDescription>最近 5 笔订单，按创建时间倒序</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={recentOrderColumns}
            data={orders}
            emptyTitle="暂无订单"
            emptyDescription="有新的订单后会自动展示在这里"
          />
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity data-icon="inline-start" className="size-3.5" />
        指标来自数据库聚合，每 60 秒刷新一次。
      </p>
    </>
  )
}
