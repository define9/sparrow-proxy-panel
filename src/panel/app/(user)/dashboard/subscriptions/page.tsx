'use client'

import type { Subscription } from '@sparrow/contracts'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, MoreHorizontal, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { DataTable } from '@/components/common/data-table'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StateBadge } from '@/components/common/state-badge'
import { SubscriptionLinkDialog } from '@/components/user/subscription-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, queryKeys, type ListResponse } from '@/lib/api/client'
import { subscriptionUrl } from '@/lib/billing'
import { daysLeft, formatDate } from '@/lib/format'

export default function SubscriptionsPage() {
  const router = useRouter()
  const [dialogSub, setDialogSub] = useState<Subscription | null>(null)

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.subscriptions(),
    queryFn: () => apiFetch<ListResponse<Subscription>>('/api/v1/user/subscriptions')
  })

  const sorted = useMemo(
    () =>
      [...(data?.data ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [data]
  )

  const columns = useMemo<ColumnDef<Subscription, unknown>[]>(
    () => [
      {
        accessorKey: 'planName',
        header: '套餐',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/dashboard/subscriptions/${row.original.id}`}
              className="text-sm font-medium hover:underline"
            >
              {row.original.planName}
            </Link>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.id}
            </span>
          </div>
        )
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => <StateBadge status={row.original.status} />
      },
      {
        id: 'quota',
        header: '流量',
        cell: ({ row }) => (
          <QuotaBar used={row.original.trafficUsed} limit={row.original.trafficLimit} />
        )
      },
      {
        accessorKey: 'expireAt',
        header: '到期时间',
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatDate(row.original.expireAt)}
          </span>
        )
      },
      {
        id: 'daysLeft',
        header: '剩余天数',
        cell: ({ row }) => {
          const days = daysLeft(row.original.expireAt)
          return (
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                days < 0 ? 'text-destructive' : days <= 7 ? 'text-warning' : 'text-muted-foreground'
              )}
            >
              {days < 0 ? `已过期 ${Math.abs(days)} 天` : `${days} 天`}
            </span>
          )
        }
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const subscription = row.original
          const url = subscriptionUrl(subscription.token, subscription.format)
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`订阅 ${subscription.id} 操作`}
                  >
                    <MoreHorizontal data-icon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => router.push(`/dashboard/subscriptions/${subscription.id}`)}
                  >
                    <Eye data-icon aria-hidden="true" />
                    查看详情
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void navigator.clipboard
                        .writeText(url)
                        .then(() => toast.success('已复制订阅链接'))
                        .catch(() => toast.error('复制失败，请手动选择文本'))
                    }}
                  >
                    <Copy data-icon aria-hidden="true" />
                    复制链接
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialogSub(subscription)}>
                    <QrCode data-icon aria-hidden="true" />
                    二维码预览
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
        title="订阅"
        description="复制订阅链接导入客户端，或查看二维码与设备占用情况。"
        actions={
          <>
            <Badge variant="outline">共 {sorted.length} 个订阅</Badge>
            <Button asChild>
              <Link href="/dashboard/plans">购买新套餐</Link>
            </Button>
          </>
        }
      />

      {isPending ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : isError ? (
        <ErrorState description="订阅列表加载失败，请稍后重试。" onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={sorted}
          emptyTitle="还没有订阅"
          emptyDescription="购买套餐后订阅会自动开通，并出现在这里。"
        />
      )}

      <SubscriptionLinkDialog
        subscription={dialogSub}
        open={dialogSub !== null}
        onOpenChange={(open) => {
          if (!open) setDialogSub(null)
        }}
      />
    </>
  )
}
