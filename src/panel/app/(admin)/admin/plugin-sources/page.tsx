'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Info, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { PageHeader } from '@/components/common/page-header'
import {
  PluginSourceDialog,
  type NewSourceInput,
  type SourceType
} from '@/components/admin/plugin-source-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/common/state-badge'
import { formatDate } from '@/lib/format'
import { useCreatePluginSource, usePluginSources, type PluginSourceDto } from '@/lib/api/admin'

const pluginSourceTypeLabels: Record<SourceType, string> = {
  url: 'HTTP JSON',
  git: 'Git 仓库',
  marketplace: '官方市场'
}

export default function AdminPluginSourcesPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = usePluginSources({ q: debounced })
  const createSource = useCreatePluginSource()
  const rows = data?.data ?? []

  async function handleCreate(input: NewSourceInput) {
    await createSource.mutateAsync(input)
  }

  const columns: ColumnDef<PluginSourceDto>[] = [
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
      cell: ({ row }) =>
        row.original.enabled ? (
          <Badge variant="success">已启用</Badge>
        ) : (
          <Badge variant="secondary">已停用</Badge>
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
          {row.original.lastError ? (
            <span className="text-xs text-muted-foreground">{row.original.lastError}</span>
          ) : null}
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
        <span className="text-xs text-muted-foreground">共 {data?.meta.total ?? 0} 个源</span>
      </FilterBar>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyTitle="暂无索引源"
          emptyDescription="新建一个源开始发现插件"
        />
      )}

      <PluginSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />
    </>
  )
}
