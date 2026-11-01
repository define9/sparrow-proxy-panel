'use client'

import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Ban, MailWarning, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/admin/filter-bar'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { UserSheet } from '@/components/admin/user-sheet'
import { formatDate, formatMoney } from '@/lib/format'
import { useAdminUsers, type AdminUserDto } from '@/lib/api/admin'

const roleLabels: Record<string, string> = {
  user: '普通用户',
  admin: '管理员',
  superadmin: '超级管理员'
}

const statusBadge: Record<AdminUserDto['status'], string> = {
  active: 'verified',
  pending: 'unverified',
  disabled: 'banned'
}

function roleLabel(user: AdminUserDto) {
  return roleLabels[user.roleCode] ?? user.roleName ?? user.roleCode
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [role, setRole] = useState<'all' | string>('all')
  const [status, setStatus] = useState<'all' | 'verified' | 'unverified' | 'banned'>('all')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState<AdminUserDto | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = useAdminUsers({
    q: debounced,
    role,
    status,
    page
  })

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.pageSize ?? 20

  const columns: ColumnDef<AdminUserDto>[] = [
    {
      accessorKey: 'email',
      header: '邮箱',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.email}</span>
    },
    { accessorKey: 'username', header: '用户名' },
    {
      accessorKey: 'roleCode',
      header: '角色',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.roleCode === 'superadmin'
              ? 'default'
              : row.original.roleCode === 'admin'
                ? 'info'
                : 'secondary'
          }
        >
          {roleLabel(row.original)}
        </Badge>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={statusBadge[row.original.status]} />
    },
    {
      accessorKey: 'balance',
      header: '余额',
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{formatMoney(row.original.balance)}</span>
      )
    },
    {
      id: 'traffic',
      header: '已用流量',
      cell: ({ row }) => <QuotaBar used={row.original.trafficUsed} limit={row.original.trafficLimit} />
    },
    {
      id: 'subscriptions',
      header: '订阅',
      cell: ({ row }) => <span className="font-mono text-sm tabular-nums">{row.original.subscriptionCount}</span>
    },
    {
      accessorKey: 'createdAt',
      header: '注册时间',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
    },
    {
      accessorKey: 'lastLoginAt',
      header: '最近登录',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.original.lastLoginAt)}</span>
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
            setActive(row.original)
            setSheetOpen(true)
          }}
        >
          管理
        </Button>
      )
    }
  ]

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <PageHeader
        title="用户管理"
        description="查看用户资料、会话与用量，处理余额与封禁"
        actions={
          <Button variant="outline" onClick={() => toast.info('导出接口尚未提供')}>
            <Users data-icon="inline-start" />
            导出用户
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="总用户" value={total.toLocaleString('zh-CN')} hint="当前筛选结果" icon={Users} />
        <StatCard label="本页用户" value={String(rows.length)} hint={`每页 ${pageSize} 条`} icon={UserPlus} />
        <StatCard
          label="本页封禁"
          value={String(rows.filter((row) => row.status === 'disabled').length)}
          hint="可解封后恢复登录"
          icon={Ban}
        />
        <StatCard
          label="本页未验证"
          value={String(rows.filter((row) => row.status === 'pending').length)}
          hint="邮箱未完成验证"
          icon={MailWarning}
        />
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索邮箱或用户名">
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-32" aria-label="角色筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部角色</SelectItem>
            <SelectItem value="user">普通用户</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="superadmin">超级管理员</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as typeof status)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-32" aria-label="状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="verified">已验证</SelectItem>
            <SelectItem value="unverified">未验证</SelectItem>
            <SelectItem value="banned">已封禁</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </FilterBar>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyTitle="没有匹配的用户"
          emptyDescription="调整关键词或筛选条件后重试"
        />
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            第 {page} / {pageCount} 页
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <UserSheet user={active} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
