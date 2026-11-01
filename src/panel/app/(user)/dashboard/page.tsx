'use client'

import Link from 'next/link'
import { ArrowUpRight, Activity, Package, Rss, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'

const links = [
  { href: '/dashboard/plans', label: '选购套餐', description: '查看可用商品与库存', icon: Package },
  { href: '/dashboard/orders', label: '我的订单', description: '支付状态与历史订单', icon: Wallet },
  { href: '/dashboard/subscriptions', label: '我的订阅', description: '订阅链接与客户端格式', icon: Rss },
  { href: '/dashboard/traffic', label: '流量统计', description: '按日用量与节点明细', icon: Activity }
]

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="概览"
        description="当前套餐、流量与最近订单（脚手架示例页，将由并行任务替换）"
        actions={<StateBadge status="active" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="当前套餐" value="Pro 月度" hint="到期 2026-12-01" icon={Package} />
        <StatCard label="剩余流量" value="82.4 GB" hint="共 200 GB" icon={Activity} trend={{ value: '+12%', positive: true }} />
        <StatCard label="在线设备" value="3 / 5" hint="可踢下线" icon={Rss} />
        <StatCard label="账户余额" value="¥ 128.00" hint="可用于续费" icon={Wallet} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>本期流量</CardTitle>
          <CardDescription>每 30 秒由 Agent 上报并聚合</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <QuotaBar used={118 * 1024 ** 3} limit={200 * 1024 ** 3} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <Card key={link.href} className="transition-colors hover:bg-muted/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <link.icon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">{link.label}</CardTitle>
                </div>
                <Button asChild variant="ghost" size="icon-sm">
                  <Link href={link.href} aria-label={link.label}>
                    <ArrowUpRight />
                  </Link>
                </Button>
              </div>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  )
}
