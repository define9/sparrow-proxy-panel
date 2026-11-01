'use client'

import type { Order } from '@sparrow/contracts'
import { Check, Circle, Clock } from 'lucide-react'
import { cn } from 'cn'
import { formatDate } from '@/lib/format'
import { orderTimeline } from '@/lib/mock/user-data'

const TONE = {
  done: 'bg-success/12 text-success ring-success/20',
  current: 'bg-warning/16 text-warning-foreground ring-warning/30',
  pending: 'bg-muted text-muted-foreground ring-border'
} as const

const ICON = {
  done: Check,
  current: Clock,
  pending: Circle
} as const

/** 订单时间线：ol/li 自绘，不引第三方 */
export function OrderTimeline({ order }: { order: Order }) {
  const steps = orderTimeline(order)

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const Icon = ICON[step.state]
        const isLast = index === steps.length - 1

        return (
          <li key={step.key} className={cn('relative flex gap-3', !isLast && 'pb-6')}>
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                'relative z-1 flex size-7 shrink-0 items-center justify-center rounded-full ring-1',
                TONE[step.state]
              )}
            >
              <Icon className="size-3.5" data-icon aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-xs text-muted-foreground">{step.description}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {step.time ? formatDate(step.time) : '待完成'}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
