'use client'

import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionHeading } from '@/components/marketing/section-heading'
import { formatMoney } from '@/lib/format'
import { plans } from '@/lib/mock/catalog'
import { cn } from 'cn'

export function PlanGrid() {
  const activePlans = plans.filter((plan) => plan.status === 'active').sort((a, b) => a.sort - b.sort)

  return (
    <section id="plans" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
      <SectionHeading
        eyebrow="套餐"
        title="按流量或按时长，选一个开始"
        description="全部套餐共享节点池，支持随时升级；演示环境价格为示例数据。"
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {activePlans.map((plan) => {
          const features = [
            plan.trafficGb > 0 ? `${plan.trafficGb} GB 流量` : '不限流量',
            `${plan.deviceLimit} 台设备同时在线`,
            plan.speedLimitMbps > 0 ? `限速 ${plan.speedLimitMbps} Mbps` : '不限速',
            `${plan.durationDays} 天有效期`
          ]
          const tags = plan.isHot ? plan.tags.filter((tag) => tag !== '推荐') : plan.tags

          return (
            <Card key={plan.id} className={cn('relative', plan.isHot && 'ring-2 ring-primary')}>
              <CardHeader>
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                {plan.isHot ? (
                  <CardAction>
                    <Badge>推荐</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-semibold tabular-nums">
                      {formatMoney(plan.price)}
                    </span>
                    <span className="text-xs text-muted-foreground">/ {plan.durationDays} 天</span>
                  </div>
                  {plan.originalPrice ? (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatMoney(plan.originalPrice)}
                    </span>
                  ) : null}
                </div>

                <ul className="flex flex-col gap-2 text-sm">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="size-3.5 shrink-0 text-success" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>

              <CardFooter>
                <Button asChild variant={plan.isHot ? 'default' : 'outline'} className="w-full">
                  <Link href="/dashboard/plans">
                    立即选购
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
