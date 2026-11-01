'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { Order } from '@sparrow/contracts'
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
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import { announcements, nodes, orders, overviewStats } from '@/lib/mock/catalog'
import { revenueSeries, revenueTotal } from '@/lib/mock/admin-catalog'

const revenueConfig = {
  revenue: { label: '实收金额', color: 'var(--chart-1)' }
} satisfies ChartConfig

const nodeCounts = nodes.reduce(
  (counts, node) => {
    counts[node.status] += 1
    return counts
  },
  { online: 0, offline: 0, maintenance: 0 }
)

const recentOrders = orders.slice(0, 5)

const recentOrderColumns: ColumnDef<Order>[] = [
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

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="仪表盘"
        description="平台运营概览：收入、订单、订阅与节点状态（演示数据）"
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
          value={overviewStats.users.total.toLocaleString('zh-CN')}
          hint={`今日新增 ${overviewStats.users.newToday}`}
          icon={Users}
          trend={{ value: overviewStats.users.trend, positive: true }}
        />
        <StatCard
          label="今日收入"
          value={formatMoney(overviewStats.revenue.today)}
          hint={`本月 ${formatMoney(overviewStats.revenue.month)}`}
          icon={CreditCard}
          trend={{ value: overviewStats.revenue.trend, positive: true }}
        />
        <StatCard
          label="今日订单"
          value={overviewStats.orders.today.toLocaleString('zh-CN')}
          hint={`${overviewStats.orders.pending} 笔待支付`}
          icon={Receipt}
          trend={{ value: overviewStats.orders.trend, positive: true }}
        />
        <StatCard
          label="活跃订阅"
          value={overviewStats.subscriptions.active.toLocaleString('zh-CN')}
          hint={`${overviewStats.subscriptions.expiring} 个 7 天内到期`}
          icon={Rss}
          trend={{ value: overviewStats.subscriptions.trend, positive: true }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>收入趋势</CardTitle>
            <CardDescription>近 14 天实收金额，合计 {formatMoney(revenueTotal)}</CardDescription>
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
                  tickFormatter={(value: number) => `¥${Math.round(value / 100) / 10}k`}
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
              共 {nodes.length} 个节点，实时在线 {nodeCounts.online} 个
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-success">
                  {nodeCounts.online}
                </span>
                <span className="text-sm text-muted-foreground">/ {nodes.length} 在线</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StateBadge status="offline" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {nodeCounts.offline}
                </span>
                <StateBadge status="maintenance" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {nodeCounts.maintenance}
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
                        {node.groupName} · {node.onlineUsers} 人在线
                      </span>
                    </div>
                  </div>
                  <StateBadge status={node.status} />
                </li>
              ))}
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
            <CardTitle>最近订单</CardTitle>
            <CardDescription>最近 5 笔订单，按创建时间倒序</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={recentOrderColumns}
              data={recentOrders}
              emptyTitle="暂无订单"
              emptyDescription="有新的订单后会自动展示在这里"
            />
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
            <ul className="flex flex-col gap-4">
              {announcements.map((item) => (
                <li key={item.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={item.level === 'warning' ? 'warning' : 'info'}>
                        {item.level === 'warning' ? '运维' : '动态'}
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
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity data-icon="inline-start" className="size-3.5" />
        指标每 60 秒刷新一次，当前为演示数据。
      </p>
    </>
  )
}
