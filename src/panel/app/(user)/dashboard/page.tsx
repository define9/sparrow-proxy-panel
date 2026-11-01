'use client'

import type { Order } from '@sparrow/contracts'
import type { ColumnDef } from '@tanstack/react-table'
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
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBytes, formatDate, formatDay, formatMoney } from '@/lib/format'
import { announcements } from '@/lib/mock/catalog'
import {
  account,
  currentSubscription,
  devices,
  orderTotal,
  recentOrders,
  trafficSummary
} from '@/lib/mock/user-data'

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

export default function DashboardPage() {
  const quotaUsed = trafficSummary.monthUsed
  const quotaLimit = currentSubscription.trafficLimit

  return (
    <>
      <PageHeader
        title="概览"
        description={`欢迎回来，${account.nickname}。这里是你的套餐、流量与最近订单。`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => toast.info('演示环境：数据刷新接口未接入')}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="当前套餐"
          value={currentSubscription.planName}
          hint={`到期 ${formatDay(currentSubscription.expireAt)}`}
          icon={Package}
        />
        <StatCard
          label="剩余流量"
          value={formatBytes(trafficSummary.remaining, 1)}
          hint={`总量 ${formatBytes(quotaLimit, 0)}`}
          icon={Activity}
        />
        <StatCard
          label="在线设备"
          value={`${devices.length} / ${currentSubscription.deviceLimit}`}
          hint="可在订阅详情中踢下线"
          icon={MonitorSmartphone}
        />
        <StatCard
          label="账户余额"
          value={formatMoney(account.balance)}
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
                  {currentSubscription.planName} · 流量按订阅周期重置，用尽后自动暂停
                </CardDescription>
              </div>
              <StateBadge status={currentSubscription.status} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <QuotaBar used={quotaUsed} limit={quotaLimit} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">下载</span>
                <span className="font-mono text-sm tabular-nums">
                  {formatBytes(currentSubscription.download, 1)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">上传</span>
                <span className="font-mono text-sm tabular-nums">
                  {formatBytes(currentSubscription.upload, 1)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">到期时间</span>
                <span className="font-mono text-sm tabular-nums">
                  {formatDay(currentSubscription.expireAt)}
                </span>
              </div>
            </div>
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
            <ul className="flex flex-col gap-4">
              {announcements.map((item) => (
                <li key={item.id} className="flex flex-col gap-1">
                  <div className="flex items-start gap-2">
                    <BellRing
                      className={cn(
                        'mt-0.5 size-3.5 shrink-0',
                        item.level === 'warning' ? 'text-warning' : 'text-info'
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
          <DataTable columns={orderColumns} data={recentOrders} emptyTitle="还没有订单" />
        </CardContent>
      </Card>

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
