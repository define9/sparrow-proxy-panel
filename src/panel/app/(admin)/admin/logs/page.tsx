'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { LogSheet } from '@/components/admin/log-sheet'
import { PageHeader } from '@/components/common/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/format'
import { useAdminLogs, type AdminLogDto, type LogCategory, type LogLevel } from '@/lib/api/admin'

const levelMeta: Record<LogLevel, { variant: 'info' | 'warning' | 'destructive'; label: string }> = {
  info: { variant: 'info', label: 'INFO' },
  warn: { variant: 'warning', label: 'WARN' },
  error: { variant: 'destructive', label: 'ERROR' }
}

const logCategoryLabels: Record<LogCategory, string> = {
  audit: '审计',
  login: '登录',
  task: '任务',
  agent: '节点事件'
}

const categories: LogCategory[] = ['audit', 'login', 'task', 'agent']

const RANGES = [
  { value: '1', label: '最近 1 小时' },
  { value: '24', label: '最近 24 小时' },
  { value: '168', label: '最近 7 天' },
  { value: '720', label: '最近 30 天' }
]

export default function AdminLogsPage() {
  const [category, setCategory] = useState<LogCategory>('audit')
  const [level, setLevel] = useState<'all' | LogLevel>('all')
  const [range, setRange] = useState('24')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState<AdminLogDto | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, isFetching, refetch } = useAdminLogs(category, {
    q: debounced,
    level,
    range,
    page
  })

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.pageSize ?? 20

  const columns: ColumnDef<AdminLogDto>[] = [
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <PageHeader
        title="日志"
        description="审计、登录、后台任务与节点事件统一检索，点行查看结构化 payload"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
            <Button variant="outline" onClick={() => toast.info('日志导出接口尚未提供')}>
              <Download data-icon="inline-start" />
              导出日志
            </Button>
          </div>
        }
      />

      <Tabs
        value={category}
        onValueChange={(value) => {
          setCategory(value as LogCategory)
          setPage(1)
        }}
      >
        <TabsList>
          {categories.map((key) => (
            <TabsTrigger key={key} value={key}>
              {logCategoryLabels[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={category} className="flex flex-col gap-4 pt-4">
          <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索操作者、动作、目标或消息">
            <Select
              value={level}
              onValueChange={(value) => {
                setLevel(value as 'all' | LogLevel)
                setPage(1)
              }}
            >
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
            <Select
              value={range}
              onValueChange={(value) => {
                setRange(value)
                setPage(1)
              }}
            >
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
            <span className="text-xs text-muted-foreground">共 {total} 条</span>
          </FilterBar>

          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : isError ? (
            <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              emptyTitle="该条件下没有日志"
              emptyDescription="放宽时间范围或清空关键词后重试"
              onRowClick={(log) => {
                setActive(log)
                setSheetOpen(true)
              }}
            />
          )}

          {total > pageSize ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">
                第 {page} / {pageCount} 页
              </span>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <LogSheet log={active} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
