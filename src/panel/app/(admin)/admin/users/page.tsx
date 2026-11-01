'use client'

import { useMemo, useState } from 'react'
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
import { StatCard } from '@/components/common/stat-card'
import { StateBadge } from '@/components/common/state-badge'
import { UserSheet } from '@/components/admin/user-sheet'
import { formatDate, formatMoney } from '@/lib/format'
import { userSummary, users, type AdminUser, type UserRole, type UserStatus } from '@/lib/mock/admin-ops'

const roleLabels: Record<UserRole, string> = {
  user: '普通用户',
  admin: '管理员',
  superadmin: '超级管理员'
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'all' | UserRole>('all')
  const [status, setStatus] = useState<'all' | UserStatus>('all')
  const [active, setActive] = useState<AdminUser | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const data = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchKeyword =
        !keyword || user.email.toLowerCase().includes(keyword) || user.username.toLowerCase().includes(keyword)
      const matchRole = role === 'all' || user.role === role
      const matchStatus = status === 'all' || user.status === status
      return matchKeyword && matchRole && matchStatus
    })
  }, [search, role, status])

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'email',
      header: '邮箱',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.email}</span>
    },
    { accessorKey: 'username', header: '用户名' },
    {
      accessorKey: 'role',
      header: '角色',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.role === 'superadmin' ? 'default' : row.original.role === 'admin' ? 'info' : 'secondary'
          }
        >
          {roleLabels[row.original.role]}
        </Badge>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <StateBadge status={row.original.status} />
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

  return (
    <>
      <PageHeader
        title="用户管理"
        description="查看用户资料、会话与用量，处理余额、订阅与封禁（演示数据）"
        actions={
          <Button variant="outline" onClick={() => toast.success('已开始导出用户 CSV（演示）')}>
            <Users data-icon="inline-start" />
            导出用户
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="总用户" value={userSummary.total.toLocaleString('zh-CN')} hint="含演示账号 12 个" icon={Users} />
        <StatCard label="今日新增" value={String(userSummary.newToday)} hint="较昨日 +12.4%" icon={UserPlus} />
        <StatCard label="封禁" value={String(userSummary.banned)} hint="近 7 天新增 1 个" icon={Ban} />
        <StatCard label="未验证" value={String(userSummary.unverified)} hint="邮箱未完成验证" icon={MailWarning} />
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="搜索邮箱或用户名">
        <Select value={role} onValueChange={(value) => setRole(value as 'all' | UserRole)}>
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
        <Select value={status} onValueChange={(value) => setStatus(value as 'all' | UserStatus)}>
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
        <span className="text-xs text-muted-foreground">共 {data.length} 条</span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data}
        emptyTitle="没有匹配的用户"
        emptyDescription="调整关键词或筛选条件后重试"
      />

      <UserSheet user={active} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
