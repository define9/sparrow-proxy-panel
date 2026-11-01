'use client'

import { useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { PlanCard } from '@/components/user/plan-card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { plans } from '@/lib/mock/catalog'

type PlanFilter = 'all' | 'traffic' | 'time'

const FILTERS: Array<{ value: PlanFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'traffic', label: '流量包' },
  { value: 'time', label: '时长包' }
]

export default function PlansPage() {
  const [filter, setFilter] = useState<PlanFilter>('all')

  const sorted = useMemo(() => [...plans].sort((a, b) => a.sort - b.sort), [])
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
        description="流量包按周期重置流量，时长包在有效期内不限流量。所有商品均为演示数据。"
        actions={<Badge variant="outline">共 {visible.length} 个商品</Badge>}
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

      {visible.length > 0 ? (
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
