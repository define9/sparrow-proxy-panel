'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { SectionHeading } from '@/components/marketing/section-heading'
import { apiFetch, queryKeys } from '@/lib/api/client'
import { unwrapList } from '@/lib/api/optional'
import { formatMoney } from '@/lib/format'
import { cn } from 'cn'

interface PublicPlan {
  id: string
  name: string
  description: string
  price: string
  originalPrice: string | null
  trafficGb: number
  durationDays: number
  deviceLimit: number
  speedLimitMbps: number
  isHot: boolean
  tags: string[]
  sort: number
  status: string
}

function normalizePlan(input: Record<string, unknown>, index: number): PublicPlan {
  return {
    id: String(input.id ?? `plan-${index}`),
    name: String(input.name ?? '未命名套餐'),
    description: String(input.description ?? ''),
    price: String(input.price ?? '0.00'),
    originalPrice: input.originalPrice ? String(input.originalPrice) : null,
    trafficGb: Number(input.trafficGb ?? 0),
    durationDays: Number(input.durationDays ?? 0),
    deviceLimit: Number(input.deviceLimit ?? 1),
    speedLimitMbps: Number(input.speedLimitMbps ?? 0),
    isHot: Boolean(input.isHot ?? false),
    tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
    sort: Number(input.sort ?? 0),
    status: String(input.status ?? 'active')
  }
}

export function PlanGrid() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.plans('public'),
    // 公开商品接口由另一任务提供：404 时回退到空列表
    queryFn: async () => {
      try {
        return unwrapList<Record<string, unknown>>(
          await apiFetch<unknown>('/api/v1/public/plans')
        )
      } catch {
        return []
      }
    }
  })

  const activePlans = (data ?? [])
    .map(normalizePlan)
    .filter((plan) => plan.status === 'active')
    .sort((a, b) => a.sort - b.sort)

  return (
    <section id="plans" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
      <SectionHeading
        eyebrow="套餐"
        title="按流量或按时长，选一个开始"
        description="全部套餐共享节点池，支持随时升级；价格以商品页实时展示为准。"
      />

      {activePlans.length === 0 ? (
        <Empty className="mt-8 border">
          <EmptyHeader>
            <EmptyTitle>{isPending ? '正在加载套餐…' : '暂无在售套餐'}</EmptyTitle>
            <EmptyDescription>商品接口就绪后会自动展示，管理员可在后台创建套餐。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
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
                      <span className="text-xs text-muted-foreground">
                        / {plan.durationDays} 天
                      </span>
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
      )}
    </section>
  )
}
