'use client'

import Link from 'next/link'
import { Activity, ArrowRight, Gauge, Server, Users, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/common/stat-card'
import { formatBytes } from '@/lib/format'
import { nodes, overviewStats } from '@/lib/mock/catalog'
import { avgLatencyMs, heroHighlights } from '@/lib/mock/marketing'

export function Hero() {
  const onlineNodes = nodes.filter((node) => node.status === 'online').length

  return (
    <section className="border-b bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16 lg:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <Badge variant="outline" className="w-fit gap-1.5 bg-background">
            <Zap className="size-3 text-primary" />
            自托管 · 无席位费 · 开源可审计
          </Badge>
          <div className="flex flex-col gap-2">
            <p className="font-heading text-sm font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Sparrow Proxy Panel
            </p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              把代理服务卖出去，只用一个面板
            </h1>
          </div>
          <p className="max-w-2xl text-base text-muted-foreground">
            自托管代理服务运营面板：售卖、配额、订阅、节点一体化。部署在自己的服务器上，订单、用户与流量数据全部由你掌控。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                免费试用
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#plans">查看套餐</a>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {heroHighlights.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="在线节点"
            value={`${onlineNodes} / ${overviewStats.nodes.total}`}
            hint="香港 · 日本 · 新加坡"
            icon={Server}
          />
          <StatCard
            label="累计用户"
            value={overviewStats.users.total.toLocaleString('zh-CN')}
            hint={`今日新增 ${overviewStats.users.newToday}`}
            icon={Users}
            trend={{ value: overviewStats.users.trend, positive: true }}
          />
          <StatCard
            label="今日流量"
            value={formatBytes(overviewStats.traffic.today, 1)}
            hint="按订阅聚合统计"
            icon={Activity}
            trend={{ value: overviewStats.subscriptions.trend, positive: true }}
          />
          <StatCard
            label="平均延迟"
            value={`${avgLatencyMs} ms`}
            hint="亚太三地加权"
            icon={Gauge}
          />
        </div>
      </div>
    </section>
  )
}
