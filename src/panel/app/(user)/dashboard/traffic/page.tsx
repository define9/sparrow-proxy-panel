'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, Server } from 'lucide-react'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { TrafficChart } from '@/components/user/traffic-chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatBytes, percent } from '@/lib/format'
import {
  currentSubscription,
  nodeTrafficTop,
  trafficSummary,
  userTrafficSeries
} from '@/lib/mock/user-data'

type NodeTraffic = (typeof nodeTrafficTop)[number]

const nodeColumns: ColumnDef<NodeTraffic, unknown>[] = [
  {
    accessorKey: 'name',
    header: '节点',
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm tabular-nums">{row.original.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.region} · {row.original.groupName}
        </span>
      </div>
    )
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => <StateBadge status={row.original.status} />
  },
  {
    accessorKey: 'upload',
    header: '上传',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{formatBytes(row.original.upload, 1)}</span>
    )
  },
  {
    accessorKey: 'download',
    header: '下载',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{formatBytes(row.original.download, 1)}</span>
    )
  },
  {
    accessorKey: 'total',
    header: '合计',
    cell: ({ row }) => (
      <span className="font-mono text-sm tabular-nums">{formatBytes(row.original.total, 1)}</span>
    )
  },
  {
    id: 'share',
    header: '占比',
    cell: ({ row }) => {
      const share = percent(row.original.total, trafficSummary.monthUsed)
      return (
        <div className="flex items-center gap-2">
          <Progress value={share} className="h-1.5 w-24" />
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{share}%</span>
        </div>
      )
    }
  }
]

export default function TrafficPage() {
  const uploadShare = percent(trafficSummary.upload, trafficSummary.monthUsed)
  const downloadShare = 100 - uploadShare

  return (
    <>
      <PageHeader
        title="流量统计"
        description={`${currentSubscription.planName} · 统计周期内的上传与下载明细，数据每 30 秒聚合一次。`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="本月用量"
          value={formatBytes(trafficSummary.monthUsed, 1)}
          hint={`套餐总量 ${formatBytes(trafficSummary.limit, 0)}`}
          icon={Activity}
        />
        <StatCard
          label="今日用量"
          value={formatBytes(trafficSummary.todayUsed, 1)}
          hint={`日均 ${formatBytes(trafficSummary.dailyAverage, 1)}`}
          icon={Gauge}
        />
        <StatCard
          label="上传 / 下载"
          value={`${uploadShare}% / ${downloadShare}%`}
          hint={`上传 ${formatBytes(trafficSummary.upload, 1)}`}
          icon={ArrowUpFromLine}
        />
        <StatCard
          label="剩余流量"
          value={formatBytes(trafficSummary.remaining, 1)}
          hint={`按当前日均约可用 ${trafficSummary.estimatedDays} 天`}
          icon={ArrowDownToLine}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>流量趋势</CardTitle>
          <CardDescription>近 30 天按日聚合，可切换面积图与柱状图</CardDescription>
        </CardHeader>
        <CardContent>
          <TrafficChart data={userTrafficSeries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
            <CardTitle>按节点 Top</CardTitle>
          </div>
          <CardDescription>当前订阅周期内各节点的流量占比</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={nodeColumns}
            data={nodeTrafficTop}
            emptyTitle="暂无节点流量数据"
            emptyDescription="节点开始上报后，这里会展示按节点的用量明细。"
          />
        </CardContent>
      </Card>
    </>
  )
}
