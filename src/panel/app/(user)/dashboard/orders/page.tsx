'use client'

import type { Order, OrderStatus } from '@sparrow/contracts'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, CreditCard, Eye, MoreHorizontal, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch, ApiClientError, queryKeys, type ListResponse } from '@/lib/api/client'
import type { PayResult } from '@/lib/api/types'
import { ORDER_STATUS_LABELS, orderTotal, paymentMethodLabel } from '@/lib/billing'
import { formatDate, formatMoney } from '@/lib/format'

type StatusFilter = 'all' | OrderStatus

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: ORDER_STATUS_LABELS.pending },
  { value: 'paid', label: ORDER_STATUS_LABELS.paid },
  { value: 'cancelled', label: ORDER_STATUS_LABELS.cancelled },
  { value: 'expired', label: ORDER_STATUS_LABELS.expired },
  { value: 'refunded', label: ORDER_STATUS_LABELS.refunded }
]

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback
}

export default function OrdersPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [keyword, setKeyword] = useState('')

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.orders({ status }),
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' })
      if (status !== 'all') params.set('status', status)
      return apiFetch<ListResponse<Order>>(`/api/v1/user/orders?${params.toString()}`)
    }
  })

  const invalidateOrders = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions() })
  }

  const cancelOrder = useMutation({
    mutationFn: (orderNo: string) =>
      apiFetch<Order>(`/api/v1/user/orders/${orderNo}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('订单已取消')
      invalidateOrders()
    },
    onError: (error) => toast.error(errorMessage(error, '取消失败，请稍后重试'))
  })

  const payOrder = useMutation({
    mutationFn: (orderNo: string) =>
      apiFetch<PayResult>(`/api/v1/user/orders/${orderNo}/pay`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.success(result.idempotent ? '订单已支付' : '支付成功，订阅已开通')
      invalidateOrders()
    },
    onError: (error) => toast.error(errorMessage(error, '支付失败，请稍后重试'))
  })

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return data?.data ?? []
    return (data?.data ?? []).filter(
      (order) =>
        order.orderNo.toLowerCase().includes(query) || order.planName.toLowerCase().includes(query)
    )
  }, [data, keyword])

  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        accessorKey: 'orderNo',
        header: '单号',
        cell: ({ row }) => (
          <Link
            href={`/dashboard/orders/${row.original.orderNo}`}
            className="font-mono text-xs text-primary tabular-nums hover:underline"
          >
            {row.original.orderNo}
          </Link>
        )
      },
      {
        accessorKey: 'planName',
        header: '套餐',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{row.original.planName}</span>
            <span className="text-xs text-muted-foreground">
              {paymentMethodLabel(row.original.paymentMethod)}
            </span>
          </div>
        )
      },
      {
        accessorKey: 'amount',
        header: '金额',
        cell: ({ row }) => {
          const discount = Number(row.original.discount)
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-sm tabular-nums">
                {formatMoney(orderTotal(row.original))}
              </span>
              {discount > 0 ? (
                <span className="font-mono text-xs text-success tabular-nums">
                  已优惠 {formatMoney(discount)}
                </span>
              ) : null}
            </div>
          )
        }
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => <StateBadge status={row.original.status} />
      },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatDate(row.original.createdAt)}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const order = row.original
          const pending = order.status === 'pending'
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`订单 ${order.orderNo} 操作`}>
                    <MoreHorizontal data-icon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => router.push(`/dashboard/orders/${order.orderNo}`)}>
                    <Eye data-icon aria-hidden="true" />
                    查看详情
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void navigator.clipboard
                        .writeText(order.orderNo)
                        .then(() => toast.success('已复制订单号'))
                        .catch(() => toast.error('复制失败，请手动选择文本'))
                    }}
                  >
                    <Copy data-icon aria-hidden="true" />
                    复制单号
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!pending || payOrder.isPending}
                    onSelect={() => payOrder.mutate(order.orderNo)}
                  >
                    <CreditCard data-icon aria-hidden="true" />
                    立即支付
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!pending || cancelOrder.isPending}
                    onSelect={() => cancelOrder.mutate(order.orderNo)}
                  >
                    <XCircle data-icon aria-hidden="true" />
                    取消订单
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      }
    ],
    [router, payOrder, cancelOrder]
  )

  return (
    <>
      <PageHeader
        title="订单"
        description="查看支付状态、金额与历史订单。"
        actions={<Badge variant="outline">共 {data?.meta.total ?? 0} 笔</Badge>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {STATUS_FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <Search data-icon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索单号或套餐"
            aria-label="搜索订单"
          />
        </InputGroup>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : isError ? (
        <ErrorState description="订单列表加载失败，请稍后重试。" onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyTitle="没有符合条件的订单"
          emptyDescription="调整筛选条件，或先去选购一个套餐。"
        />
      )}
    </>
  )
}
