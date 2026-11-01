'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PackageSearch } from 'lucide-react'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PlanCard } from '@/components/user/plan-card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch, queryKeys } from '@/lib/api/client'
import type { Plan } from '@/lib/api/types'

type PlanFilter = 'all' | 'traffic' | 'time'

const FILTERS: Array<{ value: PlanFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'traffic', label: '流量包' },
  { value: 'time', label: '时长包' }
]

function PlansSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-80 rounded-xl" />
      ))}
    </div>
  )
}

export default function PlansPage() {
  const [filter, setFilter] = useState<PlanFilter>('all')

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.plans('user'),
    queryFn: () => apiFetch<Plan[]>('/api/v1/user/plans')
  })

  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.sort - b.sort),
    [data]
  )
  const visible = useMemo(
    () => sorted.filter((plan) => filter === 'all' || plan.type === filter),
    [sorted, filter]
  )

  const countOf = (value: PlanFilter) =>
    value === 'all' ? sorted.length : sorted.filter((plan) => plan.type === value).length

  return (
    <>
      <PageHeader
        title="商品"
        description="流量包按周期重置流量，时长包在有效期内不限流量。"
        actions={<Badge variant="outline">共 {sorted.length} 个商品</Badge>}
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as PlanFilter)}>
        <TabsList>
          {FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {countOf(item.value)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <PlansSkeleton />
      ) : isError ? (
        <ErrorState description="商品列表加载失败，请稍后重试。" onRetry={() => void refetch()} />
      ) : visible.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PackageSearch}
          title="该分类下暂无商品"
          description="切换其他分类，或稍后再来看看。"
        />
      )}
    </>
  )
}
