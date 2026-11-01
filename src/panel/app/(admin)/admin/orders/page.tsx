'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { OrderStatus } from '@sparrow/contracts'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MoreHorizontal,
  Receipt,
  Search,
  Undo2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/common/data-table'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { OrderDetailSheet } from '@/components/admin/order-detail-sheet'
import {
  useAdminOrders,
  useCompleteAdminOrder,
  useRefundAdminOrder,
  type AdminOrderRow
} from '@/lib/api/admin-commerce'
import { orderStatusLabels, paymentMethodLabel } from '@/lib/admin-labels'
import { formatDate, formatMoney } from '@/lib/format'

type StatusFilter = 'all' | OrderStatus

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: orderStatusLabels.pending },
  { value: 'paid', label: orderStatusLabels.paid },
  { value: 'cancelled', label: orderStatusLabels.cancelled },
  { value: 'expired', label: orderStatusLabels.expired },
  { value: 'refunded', label: orderStatusLabels.refunded }
]

const CSV_HEADER = ['单号', '用户邮箱', '套餐', '金额', '状态', '支付方式', '创建时间']

function toCsv(rows: AdminOrderRow[]) {
  const escape = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`
  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((row) =>
      [
        row.orderNo,
        row.userEmail,
        row.planName,
        row.amount,
        orderStatusLabels[row.status],
        paymentMethodLabel(row.paymentMethod),
        formatDate(row.createdAt)
      ]
        .map(escape)
        .join(',')
    )
  ]
  return lines.join('\n')
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AdminOrderRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isLoading, isError, refetch } = useAdminOrders({
    status,
    q: debounced,
    page,
    pageSize: 20
  })

  const complete = useCompleteAdminOrder()
  const refund = useRefundAdminOrder()

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.pageSize ?? 20
  const counts = data?.counts
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const pendingCount = counts?.pending ?? 0

  function openDetail(order: AdminOrderRow) {
    setSelected(order)
    setSheetOpen(true)
  }

  function handleComplete(order: AdminOrderRow) {
    complete.mutate(
      { id: order.id },
      {
        onSuccess: (result) =>
          toast.success(
            result.subscriptionId
              ? `订单 ${order.orderNo} 已完成，订阅已开通`
              : `订单 ${order.orderNo} 已是已支付状态`
          ),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function handleRefund(order: AdminOrderRow) {
    if (!window.confirm(`确认退款订单 ${order.orderNo}（${formatMoney(order.amount)}）？关联订阅会被取消。`)) {
      return
    }
    refund.mutate(
      { id: order.id },
      {
        onSuccess: () => toast.success(`订单 ${order.orderNo} 已退款`),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.info('当前没有可导出的订单')
      return
    }
    const blob = new Blob([`\ufeff${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${rows.length} 条订单`)
  }

  const columns: ColumnDef<AdminOrderRow>[] = [
    {
      accessorKey: 'orderNo',
      header: '单号',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{row.original.orderNo}</span>
      )
    },
    {
      accessorKey: 'userEmail',
      header: '用户邮箱',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.userEmail}</span>
    },
    { accessorKey: 'planName', header: '套餐' },
    {
      accessorKey: 'amount',
      header: '金额',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{formatMoney(row.original.amount)}</span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      accessorKey: 'paymentMethod',
      header: '支付方式',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {paymentMethodLabel(row.original.paymentMethod)}
        </span>
      )
    },
    {
      accessorKey: 'createdAt',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
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
                aria-label={`订单 ${row.original.orderNo} 操作`}
              >
                <MoreHorizontal data-icon="inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => openDetail(row.original)}>
                <Eye data-icon="inline-start" />
                查看详情
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={row.original.status !== 'pending'}
                onSelect={() => handleComplete(row.original)}
              >
                <CheckCircle2 data-icon="inline-start" />
                手动完成
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={row.original.status !== 'paid'}
                onSelect={() => handleRefund(row.original)}
              >
                <Undo2 data-icon="inline-start" />
                退款
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
        title="订单管理"
        description={`共 ${counts?.all ?? total} 笔订单，${pendingCount} 笔待支付`}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download data-icon="inline-start" />
            导出订单
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter)
            setPage(1)
          }}
        >
          <TabsList className="max-w-full overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-2.5">
                {tab.label}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {counts?.[tab.value] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-auto">
          <Search
            data-icon="inline-start"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单号 / 邮箱 / 套餐"
            aria-label="搜索订单"
            className="w-full pl-8 sm:w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Receipt data-icon="inline-start" className="size-3.5" />
        当前筛选出 {total} 笔订单，点击行可查看详情
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState
          title="订单加载失败"
          description="请检查登录状态或稍后重试。"
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          onRowClick={openDetail}
          emptyTitle="没有匹配的订单"
          emptyDescription="换个状态或关键词试试"
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

      <OrderDetailSheet order={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
