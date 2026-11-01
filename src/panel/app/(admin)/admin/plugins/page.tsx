'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Info, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { PluginInstallDialog } from '@/components/admin/plugin-install-dialog'
import { PluginSheet } from '@/components/admin/plugin-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/common/state-badge'
import { FilterBar } from '@/components/admin/filter-bar'
import { useAdminPlugins, type PluginDto, type PluginType } from '@/lib/api/admin'

const pluginTypeLabels: Record<PluginType, string> = {
  payment: '支付',
  node_source: '节点源',
  subscription: '订阅',
  notify: '通知',
  hook: '钩子',
  ui: '界面'
}

/** `owner/repo@sha 前 7 位` */
function repoLabel(repoUrl: string, commitSha: string) {
  const path = repoUrl.replace(/^https?:\/\/github\.com\//, '')
  return `${path}@${commitSha.slice(0, 7)}`
}

export default function AdminPluginsPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = useAdminPlugins({ q: debounced })
  const rows = data?.data ?? []

  const columns: ColumnDef<PluginDto>[] = [
    {
      id: 'name',
      header: '名称',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.key}</span>
        </div>
      )
    },
    {
      accessorKey: 'version',
      header: '版本',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.version}</span>
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => <span className="text-sm">{pluginTypeLabels[row.original.type]}</span>
    },
    {
      id: 'repo',
      header: '仓库',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {repoLabel(row.original.repoUrl, row.original.commitSha)}
        </span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
    },
    {
      accessorKey: 'health',
      header: '健康',
      cell: ({ row }) => <StateBadge status={row.original.health} />
    },
    {
      id: 'signed',
      header: '签名',
      cell: ({ row }) =>
        row.original.signed ? (
          <Badge variant="success">已验证</Badge>
        ) : (
          <Badge variant="warning">未签名</Badge>
        )
    },
    {
      id: 'jobs',
      header: '定时任务',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{row.original.jobCount ?? 0}</span>
      )
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setActiveKey(row.original.key)
            setSheetOpen(true)
          }}
        >
          详情
        </Button>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="插件管理"
        description="从 Git 仓库直接安装社区插件，安装前预览权限与出网域名"
        actions={
          <Button onClick={() => setInstallOpen(true)}>
            <Plus data-icon="inline-start" />
            安装插件
          </Button>
        }
      />

      <Alert>
        <Info data-icon="inline-start" />
        <AlertTitle>社区插件填 git URL 即可安装</AlertTitle>
        <AlertDescription>
          安装前会展示 manifest 申请的权限与出网域名，确认后才会拉取代码；安装完成即固定到 commit sha，
          作者后续推送不会自动生效。
        </AlertDescription>
      </Alert>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索插件名称、key 或仓库">
        <span className="text-xs text-muted-foreground">共 {data?.meta.total ?? 0} 个插件</span>
      </FilterBar>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyTitle="没有匹配的插件"
          emptyDescription="换个关键词，或点右上角「安装插件」"
        />
      )}

      <PluginSheet pluginKey={activeKey} open={sheetOpen} onOpenChange={setSheetOpen} />
      <PluginInstallDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  )
}
