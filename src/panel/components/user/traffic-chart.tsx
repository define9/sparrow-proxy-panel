'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes } from '@/lib/format'

export interface TrafficPoint {
  date: string
  upload: number
  download: number
  total: number
}

const chartConfig = {
  download: { label: '下载', color: 'var(--chart-1)' },
  upload: { label: '上传', color: 'var(--chart-2)' }
} satisfies ChartConfig

const toGb = (bytes: number) => Number((bytes / 1024 ** 3).toFixed(2))

export function TrafficChart({ data }: { data: TrafficPoint[] }) {
  const [mode, setMode] = useState<'area' | 'bar'>('area')

  const points = useMemo(
    () =>
      data.map((item) => ({
        date: item.date,
        download: toGb(item.download),
        upload: toGb(item.upload)
      })),
    [data]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">近 30 天流量</p>
          <p className="text-xs text-muted-foreground">按日聚合上传与下载，单位 GB</p>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'area' | 'bar')}>
          <TabsList>
            <TabsTrigger value="area">
              <AreaChartIcon data-icon aria-hidden="true" />
              面积图
            </TabsTrigger>
            <TabsTrigger value="bar">
              <BarChart3 data-icon aria-hidden="true" />
              柱状图
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
        {mode === 'area' ? (
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fill-download" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-download)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-download)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fill-upload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-upload)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-upload)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={(value: number) => `${value} GB`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Area
              type="monotone"
              dataKey="download"
              stackId="traffic"
              stroke="var(--color-download)"
              fill="url(#fill-download)"
            />
            <Area
              type="monotone"
              dataKey="upload"
              stackId="traffic"
              stroke="var(--color-upload)"
              fill="url(#fill-upload)"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        ) : (
          <BarChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={(value: number) => `${value} GB`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Bar dataKey="download" stackId="traffic" fill="var(--color-download)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="upload" stackId="traffic" fill="var(--color-upload)" radius={[2, 2, 0, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        )}
      </ChartContainer>

      <p className="text-xs text-muted-foreground">
        近 30 天合计 {formatBytes(points.reduce((sum, item) => sum + item.download + item.upload, 0) * 1024 ** 3)}
      </p>
    </div>
  )
}
