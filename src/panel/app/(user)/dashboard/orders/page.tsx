'use client'

import type { Order, OrderStatus } from '@sparrow/contracts'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Copy, Eye, MoreHorizontal, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate, formatMoney } from '@/lib/format'
import { orders } from '@/lib/mock/catalog'
import { ORDER_STATUS_LABELS, orderTotal, paymentMethodLabel } from '@/lib/mock/user-data'

type StatusFilter = 'all' | OrderStatus

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: ORDER_STATUS_LABELS.pending },
  { value: 'paid', label: ORDER_STATUS_LABELS.paid },
  { value: 'cancelled', label: ORDER_STATUS_LABELS.cancelled },
  { value: 'expired', label: ORDER_STATUS_LABELS.expired },
  { value: 'refunded', label: ORDER_STATUS_LABELS.refunded }
]

export default function OrdersPage() {
  const router = useRouter()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    []
  )

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return sorted.filter((order) => {
      const matchStatus = status === 'all' || order.status === status
      const matchKeyword =
        keyword.length === 0 ||
        order.orderNo.toLowerCase().includes(keyword) ||
        order.planName.toLowerCase().includes(keyword)
      return matchStatus && matchKeyword
    })
  }, [sorted, status, query])

  const countOf = (value: StatusFilter) =>
    value === 'all' ? sorted.length : sorted.filter((order) => order.status === value).length

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
                    variant="destructive"
                    disabled={order.status !== 'pending'}
                    onSelect={() => toast.info('演示环境：订单取消接口未接入')}
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
    [router]
  )

  return (
    <>
      <PageHeader
        title="订单"
        description="查看支付状态、金额与历史订单。演示环境不会产生真实扣费。"
        actions={<Badge variant="outline">共 {visible.length} 笔</Badge>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {STATUS_FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {countOf(item.value)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <Search data-icon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单号或套餐"
            aria-label="搜索订单"
          />
        </InputGroup>
      </div>

      <DataTable
        columns={columns}
        data={visible}
        emptyTitle="没有符合条件的订单"
        emptyDescription="调整筛选条件，或先去选购一个套餐。"
      />
    </>
  )
}
