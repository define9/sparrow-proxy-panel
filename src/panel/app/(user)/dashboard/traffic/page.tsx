'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge } from 'lucide-react'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { TrafficChart } from '@/components/user/traffic-chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, queryKeys } from '@/lib/api/client'
import type { OverviewData, TrafficPoint } from '@/lib/api/types'
import { formatBytes, percent } from '@/lib/format'

const RANGE = '30d'

export default function TrafficPage() {
  const overview = useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => apiFetch<OverviewData>('/api/v1/user/overview')
  })

  const traffic = useQuery({
    queryKey: queryKeys.traffic(RANGE),
    queryFn: () => apiFetch<TrafficPoint[]>(`/api/v1/user/traffic?range=${RANGE}`)
  })

  const points = useMemo(() => traffic.data ?? [], [traffic.data])

  const summary = useMemo(() => {
    const upload = points.reduce((sum, point) => sum + point.upload, 0)
    const download = points.reduce((sum, point) => sum + point.download, 0)
    const total = upload + download
    const today = points[points.length - 1]?.total ?? 0
    return {
      upload,
      download,
      total: total > 0 ? total : (overview.data?.traffic.monthUsed ?? 0),
      today,
      dailyAverage: Math.round((total > 0 ? total : (overview.data?.traffic.monthUsed ?? 0)) / 30)
    }
  }, [points, overview.data])

  const limit = overview.data?.subscription?.trafficLimit ?? 0
  const remaining = limit > 0 ? Math.max(limit - summary.total, 0) : 0
  const estimatedDays =
    limit > 0 && summary.dailyAverage > 0 ? Math.floor(remaining / summary.dailyAverage) : 0

  const uploadShare = percent(summary.upload, summary.total)
  const downloadShare = summary.total > 0 ? 100 - uploadShare : 0

  const isLoading = overview.isPending || traffic.isPending
  const isError = overview.isError || traffic.isError

  return (
    <>
      <PageHeader
        title="流量统计"
        description={`${overview.data?.subscription?.planName ?? '未开通订阅'} · 统计周期内的上传与下载明细，数据每 30 秒聚合一次。`}
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </div>
      ) : isError ? (
        <ErrorState
          description="流量数据加载失败，请稍后重试。"
          onRetry={() => {
            void overview.refetch()
            void traffic.refetch()
          }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="本月用量"
              value={formatBytes(summary.total, 1)}
              hint={`套餐总量 ${limit > 0 ? formatBytes(limit, 0) : '不限'}`}
              icon={Activity}
            />
            <StatCard
              label="今日用量"
              value={formatBytes(summary.today, 1)}
              hint={`日均 ${formatBytes(summary.dailyAverage, 1)}`}
              icon={Gauge}
            />
            <StatCard
              label="上传 / 下载"
              value={`${uploadShare}% / ${downloadShare}%`}
              hint={`上传 ${formatBytes(summary.upload, 1)}`}
              icon={ArrowUpFromLine}
            />
            <StatCard
              label="剩余流量"
              value={formatBytes(remaining, 1)}
              hint={
                limit > 0 ? `按当前日均约可用 ${estimatedDays} 天` : '套餐不限流量'
              }
              icon={ArrowDownToLine}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>流量趋势</CardTitle>
              <CardDescription>近 30 天按日聚合，可切换面积图与柱状图</CardDescription>
            </CardHeader>
            <CardContent>
              {points.length > 0 ? (
                <TrafficChart data={points} />
              ) : (
                <EmptyState
                  icon={Activity}
                  title="暂无流量数据"
                  description="节点上报流量并完成聚合后，这里会展示每日用量。"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
