'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Node } from '@sparrow/contracts'
import { Activity, FolderTree, Pencil, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { StateBadge } from '@/components/common/state-badge'
import {
  GroupEditDialog,
  type NodeGroupPatch
} from '@/components/admin/node/group-edit-dialog'
import { SegmentedControl } from '@/components/admin/node/segmented-control'
import { formatRelative, percent } from '@/lib/format'
import { nodes } from '@/lib/mock/catalog'
import { buildGroupStats, type NodeGroupStat } from '@/lib/mock/admin-nodes'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default function AdminNodeGroupsPage() {
  const [groupList, setGroupList] = useState<NodeGroupStat[]>(() => buildGroupStats(nodes))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState('all')

  const editing = groupList.find((group) => group.id === editingId) ?? null

  const groupNameById = useMemo(() => {
    return new Map(groupList.map((group) => [group.id, group.name]))
  }, [groupList])

  const groupNodes = useMemo(() => {
    if (activeGroup === 'all') return nodes
    return nodes.filter((node) => node.groupId === activeGroup)
  }, [activeGroup])

  function handleSave(id: string, patch: NodeGroupPatch) {
    setGroupList((prev) =>
      prev.map((group) => (group.id === id ? { ...group, ...patch } : group))
    )
  }

  const columns: ColumnDef<Node>[] = [
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
        <span className="font-mono text-sm tabular-nums">×{row.original.rate}</span>
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
          <Badge variant="secondary">
            <FolderTree data-icon="inline-start" />
            {groupList.length} 个分组
          </Badge>
        }
      />

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
                <Button variant="ghost" size="sm" onClick={() => setEditingId(group.id)}>
                  <Pencil data-icon="inline-start" />
                  编辑
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="min-h-10 text-sm text-muted-foreground">{group.remark}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="节点数" value={String(group.nodeCount)} />
                  <Metric label="在线" value={String(group.onlineCount)} />
                  <Metric label="平均延迟" value={`${group.avgLatency}ms`} />
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

      <DataTable
        columns={columns}
        data={groupNodes}
        emptyTitle="该分组暂无节点"
        emptyDescription="切换到其他分组，或先在节点列表中新建节点。"
      />

      <GroupEditDialog
        group={editing}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        onSave={handleSave}
      />
    </>
  )
}
