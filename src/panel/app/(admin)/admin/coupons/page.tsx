'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/common/copy-button'
import { CouponDialog, type NewCouponInput } from '@/components/admin/coupon-dialog'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { formatDay, formatMoney } from '@/lib/format'
import { couponTypeLabels, coupons, type Coupon } from '@/lib/mock/admin-ops'

export default function AdminCouponsPage() {
  const [items, setItems] = useState<Coupon[]>(coupons)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const data = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return items
    return items.filter((coupon) => coupon.code.toLowerCase().includes(keyword))
  }, [items, search])

  function handleCreate(input: NewCouponInput) {
    setItems((current) => [
      {
        id: `cpn_${Date.now()}`,
        code: input.code,
        type: input.type,
        value: input.value,
        used: 0,
        total: input.total,
        minAmount: input.minAmount,
        expiresAt: input.expiresAt,
        status: 'active',
        createdAt: new Date().toISOString()
      },
      ...current
    ])
  }

  const columns: ColumnDef<Coupon>[] = [
    {
      accessorKey: 'code',
      header: '码',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm">{row.original.code}</span>
          <CopyButton value={row.original.code} />
        </div>
      )
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => <Badge variant="outline">{couponTypeLabels[row.original.type]}</Badge>
    },
    {
      id: 'value',
      header: '面值',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">
          {row.original.type === 'fixed' ? formatMoney(row.original.value) : `${row.original.value}%`}
        </span>
      )
    },
    {
      id: 'used',
      header: '已用 / 总量',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">
          {row.original.used} / {row.original.total}
        </span>
      )
    },
    {
      accessorKey: 'minAmount',
      header: '最低消费',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{formatMoney(row.original.minAmount)}</span>
      )
    },
    {
      accessorKey: 'expiresAt',
      header: '有效期',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDay(row.original.expiresAt)}</span>
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const nextStatus = row.original.status === 'disabled' ? 'active' : 'disabled'
            setItems((current) =>
              current.map((coupon) =>
                coupon.id === row.original.id ? { ...coupon, status: nextStatus } : coupon
              )
            )
            toast.success(nextStatus === 'active' ? `已启用 ${row.original.code}` : `已停用 ${row.original.code}`)
          }}
        >
          {row.original.status === 'disabled' ? '启用' : '停用'}
        </Button>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="优惠券"
        description="创建固定金额或百分比折扣券，控制发放总量与最低消费门槛"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            创建优惠券
          </Button>
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索优惠券码">
        <span className="text-xs text-muted-foreground">
          <Ticket data-icon="inline-start" className="mr-1 inline size-3.5" />
          共 {data.length} 张
        </span>
      </FilterBar>

      <DataTable columns={columns} data={data} emptyTitle="暂无优惠券" emptyDescription="创建一张优惠券开始推广" />

      <CouponDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />
    </>
  )
}
