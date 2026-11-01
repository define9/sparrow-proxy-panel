'use client'

import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Globe2, Plus, Search, Server, Terminal, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyButton } from '@/components/common/copy-button'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { NodeActions } from '@/components/admin/node/node-actions'
import { NodeCreateDialog } from '@/components/admin/node/node-create-dialog'
import { NodeDetailSheet } from '@/components/admin/node/node-detail-sheet'
import { SegmentedControl } from '@/components/admin/node/segmented-control'
import { queryKeys } from '@/lib/api/client'
import { fetchNodeGroups, fetchNodes, deleteNode, type AdminNode } from '@/lib/api/nodes'
import { formatRelative } from '@/lib/format'

type StatusFilter = 'all' | AdminNode['status']

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'maintenance', label: '维护' }
]

const TLS_LABEL: Record<AdminNode['tlsMode'], string> = {
  none: '无',
  tls: 'TLS',
  reality: 'REALITY'
}

const PAGE_SIZE = 20

const REGISTER_TEMPLATE = 'sparrow-agent register --url https://panel.example.com --token <一次性令牌>'

export default function AdminNodesPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const filters = {
    q: query.trim() || undefined,
    groupId: groupId === 'all' ? undefined : groupId,
    status: status === 'all' ? undefined : status,
    page,
    pageSize: PAGE_SIZE
  }

  const nodesQuery = useQuery({
    queryKey: queryKeys.nodes(filters),
    queryFn: () => fetchNodes(filters),
    placeholderData: keepPreviousData
  })

  const statsQuery = useQuery({
    queryKey: ['nodes', 'stats'],
    queryFn: () => fetchNodes({ pageSize: 100 })
  })

  const groupsQuery = useQuery({
    queryKey: queryKeys.nodeGroups,
    queryFn: fetchNodeGroups
  })

  const nodeList = nodesQuery.data?.data ?? []
  const meta = nodesQuery.data?.meta
  const groupList = groupsQuery.data?.data ?? []

  const stats = useMemo(() => {
    const all = statsQuery.data?.data ?? []
    return {
      total: statsQuery.data?.meta.total ?? all.length,
      online: all.filter((node) => node.status === 'online').length,
      offline: all.filter((node) => node.status === 'offline').length,
      maintenance: all.filter((node) => node.status === 'maintenance').length,
      regions: new Set(all.map((node) => node.groupId)).size
    }
  }, [statsQuery.data])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNode(id),
    onSuccess: () => {
      toast.success('节点已删除')
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ['nodes'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.nodeGroups })
    },
    onError: (error: Error) => toast.error(error.message)
  })

  function handleDelete(node: AdminNode) {
    deleteMutation.mutate(node.id)
  }

  const columns: ColumnDef<AdminNode>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.core}</span>
        </div>
      )
    },
    {
      accessorKey: 'groupName',
      header: '节点组',
      cell: ({ row }) => <span className="text-sm">{row.original.groupName}</span>
    },
    {
      accessorKey: 'protocol',
      header: '协议',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          {row.original.protocol.toUpperCase()}
        </Badge>
      )
    },
    {
      id: 'address',
      header: '地址',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">
          {row.original.host}:{row.original.port}
        </span>
      )
    },
    {
      id: 'transport',
      header: '传输 / TLS',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-mono">{row.original.network.toUpperCase()}</span>
          <span className="text-muted-foreground">{TLS_LABEL[row.original.tlsMode]}</span>
        </div>
      )
    },
    {
      accessorKey: 'rate',
      header: '倍率',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">×{row.original.rate.toFixed(2)}</span>
      )
    },
    {
      accessorKey: 'onlineUsers',
      header: '在线人数',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{row.original.onlineUsers}</span>
      )
    },
    {
      id: 'load',
      header: 'CPU / 内存',
      cell: ({ row }) => (
        <div className="flex w-28 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Progress value={row.original.cpu} className="h-1" />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {row.original.cpu.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={row.original.memory} className="h-1" />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {row.original.memory.toFixed(1)}%
            </span>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'agentVersion',
      header: 'Agent 版本',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.agentVersion ? `v${row.original.agentVersion}` : '待注册'}
        </span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      accessorKey: 'lastSeenAt',
      header: '最后心跳',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatRelative(row.original.lastSeenAt)}
        </span>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <NodeActions
            node={row.original}
            onEdit={(node) => setSelectedId(node.id)}
            onDelete={handleDelete}
            onSynced={() => {
              queryClient.invalidateQueries({ queryKey: ['nodes'] })
            }}
          />
        </div>
      )
    }
  ]

  const hasMore = meta?.hasMore ?? false
  const total = meta?.total ?? 0

  return (
    <>
      <PageHeader
        title="节点管理"
        description="管理代理节点的接入、协议参数与运行状态"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            新建节点
          </Button>
        }
      />

      <Alert className="border-info/30 bg-info/5">
        <Terminal className="text-info" data-icon="inline-start" />
        <AlertTitle>节点接入引导</AlertTitle>
        <AlertDescription className="flex flex-col gap-1">
          <span>
            在节点服务器安装 sparrow-agent 后执行注册命令，Agent 会自动拉取配置并在 30 秒内上线。
          </span>
          <code className="mt-1 w-fit max-w-full overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
            {REGISTER_TEMPLATE}
          </code>
        </AlertDescription>
        <AlertAction>
          <CopyButton value={REGISTER_TEMPLATE} label="复制命令" />
        </AlertAction>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="节点总数" value={String(stats.total)} icon={Server} hint="覆盖全部节点组" />
        <StatCard
          label="在线"
          value={String(stats.online)}
          icon={Wifi}
          hint={`维护中 ${stats.maintenance} 台`}
        />
        <StatCard
          label="离线"
          value={String(stats.offline)}
          icon={WifiOff}
          hint="需要尽快排查心跳"
        />
        <StatCard label="覆盖地区数" value={String(stats.regions)} icon={Globe2} hint="按节点组统计" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            data-icon="inline-start"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="搜索名称或 host"
            className="pl-8"
            aria-label="搜索节点"
          />
        </div>

        <Select
          value={groupId}
          onValueChange={(value) => {
            setGroupId(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40" aria-label="按节点组筛选">
            <SelectValue placeholder="全部节点组" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部节点组</SelectItem>
            {groupList.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SegmentedControl
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
          ariaLabel="按状态筛选"
        />

        <span className="ml-auto text-xs text-muted-foreground">共 {total} 个节点</span>
      </div>

      {nodesQuery.isPending ? (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={nodeList}
          onRowClick={(node) => setSelectedId(node.id)}
          emptyTitle="没有匹配的节点"
          emptyDescription="调整搜索条件或节点组筛选后重试。"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          第 {page} 页 · 每页 {PAGE_SIZE} 条
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || nodesQuery.isFetching}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            <ChevronLeft data-icon="inline-start" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || nodesQuery.isFetching}
            onClick={() => setPage((prev) => prev + 1)}
          >
            下一页
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <NodeDetailSheet
        nodeId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        onSynced={() => {
          queryClient.invalidateQueries({ queryKey: ['nodes'] })
        }}
      />

      <NodeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['nodes'] })
          queryClient.invalidateQueries({ queryKey: queryKeys.nodeGroups })
        }}
      />
    </>
  )
}
