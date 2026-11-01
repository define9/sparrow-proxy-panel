'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gauge,
  HardDrive,
  MoreHorizontal,
  Pause,
  Play,
  Rss,
  Search
} from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StateBadge } from '@/components/common/state-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  SubscriptionBulkDialog,
  type BulkAction
} from '@/components/admin/subscription-bulk-dialog'
import { SubscriptionDetailSheet } from '@/components/admin/subscription-detail-sheet'
import {
  useAdminSubscriptions,
  useBatchAdminSubscriptions,
  useUpdateAdminSubscription,
  type AdminSubscriptionRow
} from '@/lib/api/admin-commerce'
import { daysLeft, formatDate } from '@/lib/format'

type StatusFilter = 'all' | AdminSubscriptionRow['status']

export default function AdminSubscriptionsPage() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [detail, setDetail] = useState<AdminSubscriptionRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isLoading, isError, refetch } = useAdminSubscriptions({
    q: debounced,
    status,
    page,
    pageSize: 20
  })
  const batch = useBatchAdminSubscriptions()
  const update = useUpdateAdminSubscription()

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.pageSize ?? 20
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // 列表刷新后用最新数据覆盖详情快照，避免 Sheet 展示陈旧值
  const activeDetail = detail ? (rows.find((row) => row.id === detail.id) ?? detail) : null

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))
  const someSelected = rows.some((row) => selectedIds.includes(row.id))

  function openDetail(subscription: AdminSubscriptionRow) {
    setDetail(subscription)
    setSheetOpen(true)
  }

  function toggleAll() {
    if (allSelected) {
      const visibleIds = new Set(rows.map((row) => row.id))
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)))
      return
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...rows.map((row) => row.id)])))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function handleExtend(subscription: AdminSubscriptionRow) {
    batch.mutate(
      { ids: [subscription.id], action: 'extend', value: 30 },
      {
        onSuccess: () => toast.success(`已为 ${subscription.userEmail} 延长 30 天`),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function handleTogglePause(subscription: AdminSubscriptionRow) {
    const next = subscription.status === 'paused' ? 'active' : 'paused'
    update.mutate(
      { id: subscription.id, status: next },
      {
        onSuccess: () => toast.success(next === 'active' ? '订阅已恢复' : '订阅已暂停'),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function handleBulkConfirm(action: BulkAction, value: number) {
    batch.mutate(
      { ids: selectedIds, action, value },
      {
        onSuccess: (result) => {
          const count = result.updated
          if (action === 'extend') toast.success(`已为 ${count} 个订阅延长 ${value} 天`)
          else if (action === 'quota') toast.success(`已将 ${count} 个订阅的额度调整为 ${value} GB`)
          else toast.success(`已将 ${count} 个订阅的限速调整为 ${value === 0 ? '不限速' : `${value} Mbps`}`)
          setSelectedIds([])
          setBulkAction(null)
        },
        onError: (error) => toast.error(error.message)
      }
    )
  }

  const columns: ColumnDef<AdminSubscriptionRow>[] = [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => toggleAll()}
          aria-label="全选当前订阅"
        />
      ),
      cell: ({ row }) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selectedIds.includes(row.original.id)}
            onCheckedChange={() => toggleOne(row.original.id)}
            aria-label={`选择 ${row.original.userEmail} 的订阅`}
          />
        </div>
      )
    },
    {
      accessorKey: 'userEmail',
      header: '用户',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.userEmail}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span>
        </div>
      )
    },
    { accessorKey: 'planName', header: '套餐' },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      id: 'traffic',
      header: '流量',
      cell: ({ row }) => (
        <QuotaBar used={row.original.trafficUsed} limit={row.original.trafficLimit} />
      )
    },
    {
      accessorKey: 'expireAt',
      header: '到期',
      cell: ({ row }) => {
        const remaining = daysLeft(row.original.expireAt)
        return (
          <div className="flex flex-col">
            <span className="text-xs">{formatDate(row.original.expireAt)}</span>
            <span
              className={
                remaining <= 0
                  ? 'font-mono text-xs text-destructive tabular-nums'
                  : remaining <= 7
                    ? 'font-mono text-xs text-warning tabular-nums'
                    : 'font-mono text-xs text-muted-foreground tabular-nums'
              }
            >
              {remaining <= 0 ? '已过期' : `剩 ${remaining} 天`}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'deviceLimit',
      header: '设备',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{row.original.deviceLimit} 台</span>
      )
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${row.original.userEmail} 的订阅操作`}
              >
                <MoreHorizontal data-icon="inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => openDetail(row.original)}>
                <Eye data-icon="inline-start" />
                查看详情
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExtend(row.original)}>
                <CalendarPlus data-icon="inline-start" />
                延长 30 天
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleTogglePause(row.original)}>
                {row.original.status === 'paused' ? (
                  <Play data-icon="inline-start" />
                ) : (
                  <Pause data-icon="inline-start" />
                )}
                {row.original.status === 'paused' ? '恢复订阅' : '暂停订阅'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="订阅管理"
        description={`共 ${total} 个订阅，本页 ${rows.filter((row) => row.status === 'active').length} 个生效中`}
      />

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm">
            已选 <span className="font-mono font-medium tabular-nums">{selectedIds.length}</span> 个订阅
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAction('extend')}>
              <CalendarPlus data-icon="inline-start" />
              延长 30 天
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkAction('quota')}>
              <HardDrive data-icon="inline-start" />
              调整配额
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkAction('speed')}>
              <Gauge data-icon="inline-start" />
              改限速
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              取消选择
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <Search
              data-icon="inline-start"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索用户 / 套餐 / 订阅 ID"
              aria-label="搜索订阅"
              className="w-full pl-8 sm:w-64"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-32" aria-label="按状态筛选">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">生效中</SelectItem>
              <SelectItem value="paused">已暂停</SelectItem>
              <SelectItem value="expired">已过期</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Rss data-icon="inline-start" className="size-3.5" />
          当前筛选出 {total} 个订阅，勾选后可批量操作
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState
          title="订阅加载失败"
          description="请检查登录状态或稍后重试。"
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          onRowClick={openDetail}
          emptyTitle="没有匹配的订阅"
          emptyDescription="换个关键词或状态试试"
        />
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          第 {page} / {pageCount} 页，共 {total} 条
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          <ChevronLeft data-icon="inline" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          disabled={page >= pageCount}
          onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
        >
          <ChevronRight data-icon="inline" />
        </Button>
      </div>

      <SubscriptionDetailSheet
        key={activeDetail?.id ?? 'none'}
        subscription={activeDetail}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onExtend={handleExtend}
        onTogglePause={handleTogglePause}
      />

      {bulkAction ? (
        <SubscriptionBulkDialog
          key={bulkAction}
          action={bulkAction}
          count={selectedIds.length}
          open
          onOpenChange={(open) => {
            if (!open) setBulkAction(null)
          }}
          onConfirm={handleBulkConfirm}
        />
      ) : null}
    </>
  )
}
