'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity, FolderTree, Pencil, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import {
  GroupEditDialog,
  type NodeGroupFormValues
} from '@/components/admin/node/group-edit-dialog'
import { SegmentedControl } from '@/components/admin/node/segmented-control'
import { queryKeys } from '@/lib/api/client'
import {
  createNodeGroup,
  fetchNodeGroups,
  fetchNodes,
  updateNodeGroup,
  type AdminNode,
  type AdminNodeGroup
} from '@/lib/api/nodes'
import { formatRelative, percent } from '@/lib/format'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default function AdminNodeGroupsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AdminNodeGroup | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // 每次打开对话框都换 key，让表单按当前 group 重新初始化
  const [dialogKey, setDialogKey] = useState(0)
  const [activeGroup, setActiveGroup] = useState('all')

  const groupsQuery = useQuery({
    queryKey: queryKeys.nodeGroups,
    queryFn: fetchNodeGroups
  })

  const nodesQuery = useQuery({
    queryKey: queryKeys.nodes({
      groupId: activeGroup === 'all' ? undefined : activeGroup,
      pageSize: 100
    }),
    queryFn: () =>
      fetchNodes({
        groupId: activeGroup === 'all' ? undefined : activeGroup,
        pageSize: 100
      })
  })

  const groupList = useMemo(() => groupsQuery.data?.data ?? [], [groupsQuery.data])
  const groupNodes = nodesQuery.data?.data ?? []

  const groupNameById = useMemo(
    () => new Map(groupList.map((group) => [group.id, group.name])),
    [groupList]
  )

  const saveMutation = useMutation({
    mutationFn: ({
      id,
      values
    }: {
      id: string | null
      values: NodeGroupFormValues
    }) =>
      id
        ? updateNodeGroup(id, {
            name: values.name,
            region: values.region,
            remark: values.remark || null,
            sort: values.sort
          })
        : createNodeGroup({
            name: values.name,
            region: values.region,
            remark: values.remark || null,
            sort: values.sort
          }),
    onSuccess: (_group, variables) => {
      toast.success(variables.id ? '节点组已更新' : '节点组已创建')
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.nodeGroups })
    },
    onError: (error: Error) => toast.error(error.message)
  })

  function handleSubmit(id: string | null, values: NodeGroupFormValues) {
    saveMutation.mutate({ id, values })
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
      accessorKey: 'groupId',
      header: '节点组',
      cell: ({ row }) => (
        <span className="text-sm">
          {groupNameById.get(row.original.groupId) ?? row.original.groupName}
        </span>
      )
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
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
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
      accessorKey: 'rate',
      header: '倍率',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">×{row.original.rate.toFixed(2)}</span>
      )
    },
    {
      accessorKey: 'lastSeenAt',
      header: '最后心跳',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatRelative(row.original.lastSeenAt)}
        </span>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="节点组"
        description="按地区聚合节点，统一管理与调度策略"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <FolderTree data-icon="inline-start" />
              {groupList.length} 个分组
            </Badge>
            <Button
              onClick={() => {
                setEditing(null)
                setDialogKey((prev) => prev + 1)
                setDialogOpen(true)
              }}
            >
              <Plus data-icon="inline-start" />
              新建分组
            </Button>
          </div>
        }
      />

      {groupsQuery.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupList.map((group) => {
            const onlineRate = percent(group.onlineCount, group.nodeCount)
            return (
              <Card key={group.id} className="gap-4">
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2">
                      {group.name}
                      <Badge variant="outline">{group.region}</Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">{group.id}</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(group)
                      setDialogKey((prev) => prev + 1)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil data-icon="inline-start" />
                    编辑
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="min-h-10 text-sm text-muted-foreground">
                    {group.remark ?? '暂无备注'}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="节点数" value={String(group.nodeCount)} />
                    <Metric label="在线" value={String(group.onlineCount)} />
                    <Metric
                      label="平均延迟"
                      value={group.avgLatency === null ? '—' : `${group.avgLatency}ms`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>在线率</span>
                      <span className="font-mono tabular-nums">{onlineRate}%</span>
                    </div>
                    <Progress value={onlineRate} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users data-icon="inline-start" className="size-4 text-muted-foreground" />
            组内节点
          </h2>
          <Badge variant="outline">
            <Activity data-icon="inline-start" />
            {groupNodes.length} 台
          </Badge>
        </div>
        <SegmentedControl
          value={activeGroup}
          options={[
            { value: 'all', label: '全部' },
            ...groupList.map((group) => ({ value: group.id, label: group.name }))
          ]}
          onChange={setActiveGroup}
          ariaLabel="切换节点组"
        />
      </div>

      {nodesQuery.isPending ? (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={groupNodes}
          emptyTitle="该分组暂无节点"
          emptyDescription="切换到其他分组，或先在节点列表中新建节点。"
        />
      )}

      <GroupEditDialog
        key={dialogKey}
        group={editing}
        open={dialogOpen}
        pending={saveMutation.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        onSubmit={handleSubmit}
      />
    </>
  )
}
