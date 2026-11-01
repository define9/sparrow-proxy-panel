'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Order, OrderStatus } from '@sparrow/contracts'
import { CheckCircle2, Download, Eye, MoreHorizontal, Receipt, RotateCcw, Search } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { OrderDetailSheet } from '@/components/admin/order-detail-sheet'
import { formatDate, formatMoney } from '@/lib/format'
import { orders } from '@/lib/mock/catalog'
import { orderStatusLabels, paymentMethodLabel } from '@/lib/mock/admin-catalog'

type StatusFilter = 'all' | OrderStatus

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: orderStatusLabels.pending },
  { value: 'paid', label: orderStatusLabels.paid },
  { value: 'cancelled', label: orderStatusLabels.cancelled },
  { value: 'expired', label: orderStatusLabels.expired },
  { value: 'refunded', label: orderStatusLabels.refunded }
]

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Order[]>(() => orders.map((order) => ({ ...order })))
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Order | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rows.filter((order) => {
      if (status !== 'all' && order.status !== status) return false
      if (!keyword) return true
      return (
        order.orderNo.toLowerCase().includes(keyword) ||
        order.userEmail.toLowerCase().includes(keyword) ||
        order.planName.toLowerCase().includes(keyword)
      )
    })
  }, [rows, query, status])

  function openDetail(order: Order) {
    setSelected(order)
    setSheetOpen(true)
  }

  function updateStatus(orderId: string, next: OrderStatus) {
    const paidAt = next === 'paid' ? new Date().toISOString() : undefined
    setRows((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, status: next, paidAt: paidAt ?? order.paidAt }
          : order
      )
    )
    setSelected((prev) =>
      prev && prev.id === orderId
        ? { ...prev, status: next, paidAt: paidAt ?? prev.paidAt }
        : prev
    )
  }

  function countFor(value: StatusFilter) {
    if (value === 'all') return rows.length
    return rows.filter((order) => order.status === value).length
  }

  const columns: ColumnDef<Order>[] = [
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
                onSelect={() => {
                  updateStatus(row.original.id, 'paid')
                  toast.success(`订单 ${row.original.orderNo} 已标记为已支付`)
                }}
              >
                <CheckCircle2 data-icon="inline-start" />
                手动完成
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={row.original.status !== 'paid'}
                onSelect={() => {
                  updateStatus(row.original.id, 'refunded')
                  toast.success(`订单 ${row.original.orderNo} 已退款`)
                }}
              >
                <RotateCcw data-icon="inline-start" />
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
        description={`共 ${rows.length} 笔订单，${countFor('pending')} 笔待支付`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`已导出 ${filtered.length} 条订单（演示）`)}
          >
            <Download data-icon="inline-start" />
            导出订单
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-2.5">
                {tab.label}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {countFor(tab.value)}
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
        当前筛选出 {filtered.length} 笔订单，点击行可查看详情
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={openDetail}
        emptyTitle="没有匹配的订单"
        emptyDescription="换个状态或关键词试试"
      />

      <OrderDetailSheet
        order={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onStatusChange={updateStatus}
      />
    </>
  )
}
