'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { LogSheet } from '@/components/admin/log-sheet'
import { PageHeader } from '@/components/common/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/format'
import {
  logCategoryLabels,
  logs,
  type AdminLogEntry,
  type LogCategory,
  type LogLevel
} from '@/lib/mock/admin-ops'
import { iso } from '@/lib/mock/util'

const levelMeta: Record<LogLevel, { variant: 'info' | 'warning' | 'destructive'; label: string }> = {
  info: { variant: 'info', label: 'INFO' },
  warn: { variant: 'warning', label: 'WARN' },
  error: { variant: 'destructive', label: 'ERROR' }
}

const categories: LogCategory[] = ['audit', 'login', 'task', 'agent']

const RANGES = [
  { value: '1', label: '最近 1 小时' },
  { value: '24', label: '最近 24 小时' },
  { value: '168', label: '最近 7 天' },
  { value: '720', label: '最近 30 天' }
]

/** 演示数据的基准时刻（与 mock 数据同源） */
const REFERENCE_NOW = Date.parse(iso(0))

export default function AdminLogsPage() {
  const [category, setCategory] = useState<LogCategory>('audit')
  const [level, setLevel] = useState<'all' | LogLevel>('all')
  const [range, setRange] = useState('24')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<AdminLogEntry | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const data = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const since = REFERENCE_NOW - Number(range) * 3_600_000
    return logs.filter((log) => {
      const matchCategory = log.category === category
      const matchLevel = level === 'all' || log.level === level
      const matchTime = Date.parse(log.createdAt) >= since
      const matchKeyword =
        !keyword ||
        [log.actor, log.action, log.target, log.message, log.ip ?? ''].some((field) =>
          field.toLowerCase().includes(keyword)
        )
      return matchCategory && matchLevel && matchTime && matchKeyword
    })
  }, [category, level, range, search])

  const columns: ColumnDef<AdminLogEntry>[] = [
    {
      accessorKey: 'createdAt',
      header: '时间',
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
      )
    },
    {
      accessorKey: 'level',
      header: '级别',
      cell: ({ row }) => (
        <Badge variant={levelMeta[row.original.level].variant}>{levelMeta[row.original.level].label}</Badge>
      )
    },
    { accessorKey: 'actor', header: '操作者', cell: ({ row }) => <span className="text-xs">{row.original.actor}</span> },
    {
      accessorKey: 'action',
      header: '动作',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>
    },
    {
      accessorKey: 'target',
      header: '目标',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.target}</span>
    },
    {
      accessorKey: 'ip',
      header: 'IP',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip ?? '—'}</span>
    },
    {
      accessorKey: 'message',
      header: '消息',
      cell: ({ row }) => <span className="text-xs">{row.original.message}</span>
    }
  ]

  return (
    <>
      <PageHeader
        title="日志"
        description="审计、登录、后台任务与节点事件统一检索，点行查看结构化 payload"
        actions={
          <Button variant="outline" onClick={() => toast.success('已开始导出当前筛选结果（演示）')}>
            <Download data-icon="inline-start" />
            导出日志
          </Button>
        }
      />

      <Tabs value={category} onValueChange={(value) => setCategory(value as LogCategory)}>
        <TabsList>
          {categories.map((key) => (
            <TabsTrigger key={key} value={key}>
              {logCategoryLabels[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={category} className="flex flex-col gap-4 pt-4">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索操作者、动作、目标或消息">
            <Select value={level} onValueChange={(value) => setLevel(value as 'all' | LogLevel)}>
              <SelectTrigger className="w-32" aria-label="级别筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="info">INFO</SelectItem>
                <SelectItem value="warn">WARN</SelectItem>
                <SelectItem value="error">ERROR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-36" aria-label="时间范围">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">共 {data.length} 条</span>
          </FilterBar>

          <DataTable
            columns={columns}
            data={data}
            emptyTitle="该条件下没有日志"
            emptyDescription="放宽时间范围或清空关键词后重试"
            onRowClick={(log) => {
              setActive(log)
              setSheetOpen(true)
            }}
          />
        </TabsContent>
      </Tabs>

      <LogSheet log={active} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
