'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Plan } from '@sparrow/contracts'
import { Package, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/common/data-table'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { CreatePlanDialog } from '@/components/admin/create-plan-dialog'
import { PlanRowActions } from '@/components/admin/plan-row-actions'
import {
  useAdminPlans,
  useDeleteAdminPlan,
  useDuplicateAdminPlan,
  useUpdateAdminPlan
} from '@/lib/api/admin-commerce'
import { planTypeLabels } from '@/lib/admin-labels'
import { formatMoney } from '@/lib/format'

type StatusFilter = 'all' | Plan['status']

export default function AdminPlansPage() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<Plan | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: rows = [], isLoading, isError, refetch } = useAdminPlans({
    q: debounced,
    status
  })

  const duplicate = useDuplicateAdminPlan()
  const update = useUpdateAdminPlan()
  const remove = useDeleteAdminPlan()

  const activeCount = useMemo(() => rows.filter((plan) => plan.status === 'active').length, [rows])

  function handleEdit(plan: Plan) {
    setEditing(plan)
    setEditOpen(true)
  }

  function handleDuplicate(plan: Plan) {
    duplicate.mutate(plan.id, {
      onSuccess: (copy) => toast.success(`已复制「${plan.name}」为「${copy.name}」`),
      onError: (error) => toast.error(error.message)
    })
  }

  function handleToggleStatus(plan: Plan) {
    const next = plan.status === 'active' ? 'inactive' : 'active'
    update.mutate(
      { id: plan.id, status: next },
      {
        onSuccess: () => toast.success(next === 'active' ? `「${plan.name}」已上架` : `「${plan.name}」已下架`),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function handleDelete(plan: Plan) {
    if (!window.confirm(`确认删除商品「${plan.name}」？已产生订单的商品无法删除。`)) return
    remove.mutate(plan.id, {
      onSuccess: () => toast.success(`已删除「${plan.name}」`),
      onError: (error) => toast.error(error.message)
    })
  }

  const columns: ColumnDef<Plan>[] = [
    {
      accessorKey: 'name',
      header: '商品',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
        </div>
      )
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => <Badge variant="outline">{planTypeLabels[row.original.type]}</Badge>
    },
    {
      accessorKey: 'price',
      header: '价格',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{formatMoney(row.original.price)}</span>
      )
    },
    {
      accessorKey: 'trafficGb',
      header: '流量',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.trafficGb > 0 ? `${row.original.trafficGb} GB` : '不限量'}
        </span>
      )
    },
    {
      accessorKey: 'durationDays',
      header: '时长',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{row.original.durationDays} 天</span>
      )
    },
    {
      accessorKey: 'stock',
      header: '库存',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.stock === null ? '不限' : row.original.stock}
        </span>
      )
    },
    {
      accessorKey: 'soldCount',
      header: '已售',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.soldCount.toLocaleString('zh-CN')}
        </span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <PlanRowActions
            plan={row.original}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDelete}
          />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="商品管理"
        description={`共 ${rows.length} 个商品，其中 ${activeCount} 个在售`}
        actions={<CreatePlanDialog />}
      />

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
              placeholder="搜索商品名称或 slug"
              aria-label="搜索商品"
              className="w-full pl-8 sm:w-64"
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="w-32" aria-label="按状态筛选">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">在售</SelectItem>
              <SelectItem value="inactive">已下架</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package data-icon="inline-start" className="size-3.5" />
          当前筛选出 {rows.length} 个商品
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState
          title="商品加载失败"
          description="请检查登录状态或稍后重试。"
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyTitle="没有匹配的商品"
          emptyDescription="换个关键词或状态试试，也可以直接新建商品"
        />
      )}

      {editing ? (
        <CreatePlanDialog
          key={editing.id}
          plan={editing}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) setEditing(null)
          }}
        />
      ) : null}
    </>
  )
}
