'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Subscription } from '@sparrow/contracts'
import {
  CalendarPlus,
  Eye,
  Gauge,
  HardDrive,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Rss,
  Search
} from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
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
  SubscriptionBulkDialog,
  type BulkAction
} from '@/components/admin/subscription-bulk-dialog'
import { SubscriptionDetailSheet } from '@/components/admin/subscription-detail-sheet'
import { daysLeft, formatDate } from '@/lib/format'
import { subscriptions } from '@/lib/mock/catalog'

const DAY_MS = 86_400_000

function extendBy(subscription: Subscription, days: number): Subscription {
  return {
    ...subscription,
    expireAt: new Date(new Date(subscription.expireAt).getTime() + days * DAY_MS).toISOString()
  }
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[]>(() =>
    subscriptions.map((subscription) => ({ ...subscription }))
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Subscription | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(
      (subscription) =>
        subscription.userEmail.toLowerCase().includes(keyword) ||
        subscription.planName.toLowerCase().includes(keyword) ||
        subscription.id.toLowerCase().includes(keyword)
    )
  }, [rows, query])

  const allSelected =
    filtered.length > 0 && filtered.every((subscription) => selectedIds.includes(subscription.id))
  const someSelected = filtered.some((subscription) => selectedIds.includes(subscription.id))

  function openDetail(subscription: Subscription) {
    setDetail(subscription)
    setSheetOpen(true)
  }

  function toggleAll() {
    if (allSelected) {
      const visibleIds = new Set(filtered.map((subscription) => subscription.id))
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)))
      return
    }
    setSelectedIds((prev) =>
      Array.from(new Set([...prev, ...filtered.map((subscription) => subscription.id)]))
    )
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function replaceRow(next: Subscription) {
    setRows((prev) => prev.map((row) => (row.id === next.id ? next : row)))
    setDetail((prev) => (prev && prev.id === next.id ? next : prev))
  }

  function handleExtend(subscription: Subscription) {
    replaceRow(extendBy(subscription, 30))
  }

  function handleTogglePause(subscription: Subscription) {
    replaceRow({
      ...subscription,
      status: subscription.status === 'paused' ? 'active' : 'paused'
    })
  }

  function handleResetTraffic(subscription: Subscription) {
    replaceRow({ ...subscription, trafficUsed: 0, upload: 0, download: 0 })
    toast.success(`已重置 ${subscription.userEmail} 的流量用量`)
  }

  function handleBulkConfirm(action: BulkAction, value: number) {
    const selected = new Set(selectedIds)
    setRows((prev) =>
      prev.map((subscription) => {
        if (!selected.has(subscription.id)) return subscription
        if (action === 'extend') return extendBy(subscription, value)
        if (action === 'quota') return { ...subscription, trafficLimit: value * 1024 ** 3 }
        return { ...subscription, speedLimitMbps: value }
      })
    )
    const count = selected.size
    if (action === 'extend') toast.success(`已为 ${count} 个订阅延长 ${value} 天`)
    else if (action === 'quota') toast.success(`已将 ${count} 个订阅的额度调整为 ${value} GB`)
    else toast.success(`已将 ${count} 个订阅的限速调整为 ${value === 0 ? '不限速' : `${value} Mbps`}`)
    setSelectedIds([])
    setDetail((prev) => {
      if (!prev || !selected.has(prev.id)) return prev
      if (action === 'extend') return extendBy(prev, value)
      if (action === 'quota') return { ...prev, trafficLimit: value * 1024 ** 3 }
      return { ...prev, speedLimitMbps: value }
    })
  }

  const columns: ColumnDef<Subscription>[] = [
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
              <DropdownMenuItem
                onSelect={() => {
                  handleExtend(row.original)
                  toast.success(`已为 ${row.original.userEmail} 延长 30 天`)
                }}
              >
                <CalendarPlus data-icon="inline-start" />
                延长 30 天
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleResetTraffic(row.original)}>
                <RefreshCw data-icon="inline-start" />
                重置流量
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  handleTogglePause(row.original)
                  toast.success(
                    row.original.status === 'paused' ? '订阅已恢复' : '订阅已暂停'
                  )
                }}
              >
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
        description={`共 ${rows.length} 个订阅，${rows.filter((row) => row.status === 'active').length} 个生效中`}
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
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Rss data-icon="inline-start" className="size-3.5" />
          当前筛选出 {filtered.length} 个订阅，勾选后可批量操作
        </span>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={openDetail}
        emptyTitle="没有匹配的订阅"
        emptyDescription="换个关键词试试"
      />

      <SubscriptionDetailSheet
        subscription={detail}
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
