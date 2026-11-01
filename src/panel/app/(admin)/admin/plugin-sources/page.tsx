'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Info, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { PageHeader } from '@/components/common/page-header'
import { PluginSourceDialog, type NewSourceInput } from '@/components/admin/plugin-source-dialog'
import { StateBadge } from '@/components/common/state-badge'
import { Switch } from '@/components/ui/switch'
import { formatDate } from '@/lib/format'
import {
  pluginSources,
  pluginSourceTypeLabels,
  type PluginSource
} from '@/lib/mock/admin-ops'

export default function AdminPluginSourcesPage() {
  const [items, setItems] = useState<PluginSource[]>(pluginSources)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const data = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return items
    return items.filter(
      (source) => source.name.toLowerCase().includes(keyword) || source.url.toLowerCase().includes(keyword)
    )
  }, [items, search])

  function toggle(id: string, enabled: boolean) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, enabled } : item)))
    toast.success(enabled ? '索引源已启用' : '索引源已停用')
  }

  function handleCreate(input: NewSourceInput) {
    setItems((current) => [
      {
        id: `src_${Date.now()}`,
        name: input.name,
        type: input.type,
        url: input.url,
        enabled: input.enabled,
        lastSyncedAt: input.enabled ? new Date().toISOString() : null,
        status: input.enabled ? 'healthy' : 'unknown',
        entries: 0
      },
      ...current
    ])
  }

  const columns: ColumnDef<PluginSource>[] = [
    { accessorKey: 'name', header: '名称' },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="font-mono">
            {row.original.type}
          </Badge>
          <span className="text-xs text-muted-foreground">{pluginSourceTypeLabels[row.original.type]}</span>
        </div>
      )
    },
    {
      accessorKey: 'url',
      header: '地址',
      cell: ({ row }) => (
        <span className="font-mono text-xs break-all text-muted-foreground">{row.original.url}</span>
      )
    },
    {
      id: 'enabled',
      header: '启用',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={(checked) => toggle(row.original.id, checked)}
          aria-label={`${row.original.name} 启用开关`}
        />
      )
    },
    {
      accessorKey: 'lastSyncedAt',
      header: '最近同步',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.original.lastSyncedAt)}</span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <StateBadge status={row.original.status} />
          {row.original.message ? (
            <span className="text-xs text-muted-foreground">{row.original.message}</span>
          ) : null}
        </div>
      )
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setItems((current) =>
                current.map((item) =>
                  item.id === row.original.id
                    ? { ...item, lastSyncedAt: new Date().toISOString(), status: 'healthy', message: undefined }
                    : item
                )
              )
              toast.success(`已同步「${row.original.name}」`)
            }}
          >
            <RefreshCw data-icon="inline-start" />
            同步
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setItems((current) => current.filter((item) => item.id !== row.original.id))
              toast.success(`已删除「${row.original.name}」`)
            }}
          >
            <Trash2 data-icon="inline-start" />
            删除
          </Button>
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="索引源"
        description="聚合官方市场、社区 JSON 索引与内部 Git 索引仓库"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            新建索引源
          </Button>
        }
      />

      <Alert>
        <Info data-icon="inline-start" />
        <AlertTitle>索引源只做发现</AlertTitle>
        <AlertDescription>
          索引源不会自动安装或升级插件，只同步可用列表并标记 update_available；安装仍然走 git URL 直装流水线。
        </AlertDescription>
      </Alert>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索索引源名称或地址">
        <span className="text-xs text-muted-foreground">共 {data.length} 个源</span>
      </FilterBar>

      <DataTable columns={columns} data={data} emptyTitle="暂无索引源" emptyDescription="新建一个源开始发现插件" />

      <PluginSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />
    </>
  )
}
