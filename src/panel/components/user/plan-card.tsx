'use client'

import type { Plan } from '@sparrow/contracts'
import Link from 'next/link'
import { ArrowRight, Clock, Gauge, MonitorSmartphone, Wifi } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/format'

export function PlanCard({ plan }: { plan: Plan }) {
  const available = plan.status === 'active' && (plan.stock === null || plan.stock > 0)
  const tags = plan.tags.filter((tag) => tag !== '热销')

  return (
    <Link href={`/dashboard/plans/${plan.id}`} className="group block h-full">
      <Card
        className={cn(
          'h-full gap-4 transition-colors hover:bg-muted/40',
          plan.isHot && 'ring-2 ring-primary/60'
        )}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            {plan.isHot ? <Badge>热销</Badge> : null}
            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {!available ? <Badge variant="secondary">已售罄</Badge> : null}
          </div>
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatMoney(plan.price)}
            </span>
            {plan.originalPrice ? (
              <span className="font-mono text-sm text-muted-foreground line-through tabular-nums">
                {formatMoney(plan.originalPrice)}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">/ {plan.durationDays} 天</span>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <Wifi className="size-3.5 text-muted-foreground" data-icon aria-hidden="true" />
              <span className="text-muted-foreground">流量</span>
              <span className="ml-auto font-mono tabular-nums">
                {plan.trafficGb > 0 ? `${plan.trafficGb} GB` : '不限量'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground" data-icon aria-hidden="true" />
              <span className="text-muted-foreground">时长</span>
              <span className="ml-auto font-mono tabular-nums">{plan.durationDays} 天</span>
            </li>
            <li className="flex items-center gap-2">
              <MonitorSmartphone
                className="size-3.5 text-muted-foreground"
                data-icon
                aria-hidden="true"
              />
              <span className="text-muted-foreground">设备</span>
              <span className="ml-auto font-mono tabular-nums">{plan.deviceLimit} 台</span>
            </li>
            <li className="flex items-center gap-2">
              <Gauge className="size-3.5 text-muted-foreground" data-icon aria-hidden="true" />
              <span className="text-muted-foreground">带宽</span>
              <span className="ml-auto font-mono tabular-nums">
                {plan.speedLimitMbps > 0 ? `${plan.speedLimitMbps} Mbps` : '不限速'}
              </span>
            </li>
          </ul>
        </CardContent>

        <CardFooter className="justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">已售 {plan.soldCount.toLocaleString('zh-CN')}</span>
          <span className="flex items-center gap-1 text-primary">
            查看详情
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              data-icon
              aria-hidden="true"
            />
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
