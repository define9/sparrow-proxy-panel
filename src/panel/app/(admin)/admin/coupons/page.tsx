'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/common/copy-button'
import { CouponDialog, type CouponFormInput } from '@/components/admin/coupon-dialog'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { PageHeader } from '@/components/common/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/common/state-badge'
import { formatDay, formatMoney } from '@/lib/format'
import {
  useCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useUpdateCoupon,
  type CouponDto
} from '@/lib/api/admin'

const couponTypeLabels: Record<CouponDto['type'], string> = {
  fixed: '固定金额',
  percent: '百分比'
}

function couponStatus(coupon: CouponDto): 'active' | 'expired' | 'disabled' {
  if (!coupon.enabled) return 'disabled'
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.now()) return 'expired'
  return 'active'
}

export default function AdminCouponsPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CouponDto | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = useCoupons({ q: debounced })
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon()
  const deleteCoupon = useDeleteCoupon()

  const items = useMemo(() => data?.data ?? [], [data])

  async function handleSubmit(input: CouponFormInput) {
    if (editing) {
      await updateCoupon.mutateAsync({ id: editing.id, ...input })
    } else {
      await createCoupon.mutateAsync(input)
    }
    setEditing(null)
  }

  const columns: ColumnDef<CouponDto>[] = [
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
          {row.original.type === 'fixed'
            ? formatMoney(row.original.value)
            : `${Number(row.original.value)}%`}
        </span>
      )
    },
    {
      id: 'used',
      header: '已用 / 总量',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">
          {row.original.usedCount} / {row.original.quota === 0 ? '不限' : row.original.quota}
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
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.expiresAt ? formatDay(row.original.expiresAt) : '长期有效'}
        </span>
      )
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={couponStatus(row.original)} />
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const coupon = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(coupon)
                setDialogOpen(true)
              }}
            >
              <Pencil data-icon="inline-start" />
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateCoupon.mutate(
                  { id: coupon.id, enabled: !coupon.enabled },
                  {
                    onSuccess: () =>
                      toast.success(coupon.enabled ? `已停用 ${coupon.code}` : `已启用 ${coupon.code}`),
                    onError: (mutationError) => toast.error(mutationError.message)
                  }
                )
              }
            >
              {coupon.enabled ? '停用' : '启用'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!window.confirm(`确定删除优惠券 ${coupon.code}？已产生的抵扣不受影响。`)) return
                deleteCoupon.mutate(coupon.id, {
                  onSuccess: () => toast.success(`已删除 ${coupon.code}`),
                  onError: (mutationError) => toast.error(mutationError.message)
                })
              }}
            >
              <Trash2 data-icon="inline-start" />
              删除
            </Button>
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title="优惠券"
        description="创建固定金额或百分比折扣券，控制发放总量与最低消费门槛"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus data-icon="inline-start" />
            创建优惠券
          </Button>
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索优惠券码">
        <span className="text-xs text-muted-foreground">
          <Ticket data-icon="inline-start" className="mr-1 inline size-3.5" />
          共 {data?.meta.total ?? 0} 张
        </span>
      </FilterBar>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          emptyTitle="暂无优惠券"
          emptyDescription="创建一张优惠券开始推广"
        />
      )}

      <CouponDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </>
  )
}
