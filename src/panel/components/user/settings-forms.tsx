'use client'

import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Palette, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatDay } from '@/lib/format'
import { account, apiTokens } from '@/lib/mock/user-data'

const DEMO_TOAST = '演示环境：保存接口未接入'

/* ---------------------------------- 资料 ---------------------------------- */

export function ProfileForm() {
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        toast.success(DEMO_TOAST)
      }}
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-username">用户名</FieldLabel>
            <Input id="profile-username" defaultValue={account.username} />
            <FieldDescription>登录凭证，创建后不可修改。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-nickname">昵称</FieldLabel>
            <Input id="profile-nickname" defaultValue={account.nickname} />
            <FieldDescription>显示在工单与通知中。</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="profile-email">邮箱</FieldLabel>
          <Input id="profile-email" type="email" defaultValue={account.email} />
          <FieldDescription>
            邮箱已验证，修改后需要重新验证；用于接收订单与到期提醒。
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="profile-telegram">Telegram</FieldLabel>
          <Input id="profile-telegram" defaultValue={account.telegram} placeholder="@username" />
          <FieldDescription>绑定后可接收 Telegram 通知，留空表示不接收。</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="profile-bio">个人简介</FieldLabel>
          <Textarea id="profile-bio" rows={3} defaultValue={account.bio} />
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">保存修改</Button>
        <Button type="reset" variant="outline">
          重置
        </Button>
        <span className="text-xs text-muted-foreground">
          注册于 {formatDay(account.registeredAt)}
        </span>
      </div>
    </form>
  )
}

/* ---------------------------------- 安全 ---------------------------------- */

export function SecurityForm() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [twoFactor, setTwoFactor] = useState(account.twoFactorEnabled)

  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (tooShort || mismatch) return
        toast.success(DEMO_TOAST)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="security-current">当前密码</FieldLabel>
          <Input id="security-current" type="password" autoComplete="current-password" />
        </Field>

        <Field data-invalid={tooShort}>
          <FieldLabel htmlFor="security-new">新密码</FieldLabel>
          <Input
            id="security-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={tooShort}
          />
          <FieldDescription>至少 8 位，建议包含大小写字母与数字。</FieldDescription>
          <FieldError errors={tooShort ? [{ message: '新密码至少需要 8 位字符' }] : undefined} />
        </Field>

        <Field data-invalid={mismatch}>
          <FieldLabel htmlFor="security-confirm">确认新密码</FieldLabel>
          <Input
            id="security-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={mismatch}
          />
          <FieldError errors={mismatch ? [{ message: '两次输入的新密码不一致' }] : undefined} />
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>两步验证</FieldTitle>
            <FieldDescription>登录时额外验证一次性验证码，推荐开启。</FieldDescription>
          </FieldContent>
          <Switch
            checked={twoFactor}
            onCheckedChange={(checked) => {
              setTwoFactor(checked)
              toast.info('演示环境：两步验证设置未接入')
            }}
            aria-label="两步验证"
          />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-2">
        <Button type="submit">更新密码</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => toast.info('演示环境：会话管理未接入')}
        >
          查看登录设备
        </Button>
      </div>
    </form>
  )
}

/* ---------------------------------- 通知 ---------------------------------- */

const NOTIFICATION_ITEMS = [
  { key: 'order', title: '订单与支付通知', description: '下单成功、支付到账、退款完成时发送邮件' },
  { key: 'traffic', title: '流量告警', description: '流量使用达到 80% 与 95% 时提醒' },
  { key: 'expire', title: '到期提醒', description: '订阅到期前 7 天、1 天各提醒一次' },
  { key: 'announcement', title: '站点公告', description: '节点维护、线路调整等运营公告' },
  { key: 'marketing', title: '活动与优惠', description: '新品上架与折扣活动推送' }
] as const

export function NotificationForm() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    order: true,
    traffic: true,
    expire: true,
    announcement: true,
    marketing: false
  })

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        toast.success(DEMO_TOAST)
      }}
    >
      <FieldGroup>
        {NOTIFICATION_ITEMS.map((item) => (
          <Field key={item.key} orientation="horizontal">
            <FieldContent>
              <FieldTitle>{item.title}</FieldTitle>
              <FieldDescription>{item.description}</FieldDescription>
            </FieldContent>
            <Switch
              checked={enabled[item.key] ?? false}
              onCheckedChange={(checked) =>
                setEnabled((previous) => ({ ...previous, [item.key]: checked }))
              }
              aria-label={item.title}
            />
          </Field>
        ))}
      </FieldGroup>

      <div className="flex items-center gap-2">
        <Button type="submit">保存通知设置</Button>
      </div>
    </form>
  )
}

/* ---------------------------------- 外观 ---------------------------------- */

export function AppearancePanel() {
  const [compact, setCompact] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Palette data-icon aria-hidden="true" />
        <AlertTitle>主题切换在右上角用户菜单</AlertTitle>
        <AlertDescription>
          桌面端入口在侧边栏底部的用户菜单，移动端从顶部工具栏打开；提供「浅色 / 深色 /
          跟随系统」三个选项，选择后立即生效并记忆到本机。
        </AlertDescription>
      </Alert>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="appearance-language">界面语言</FieldLabel>
          <Select defaultValue={account.language}>
            <SelectTrigger id="appearance-language" className="w-full sm:w-64">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>语言切换仅影响界面文案，不影响订阅输出。</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="appearance-timezone">时区</FieldLabel>
          <Select defaultValue={account.timezone}>
            <SelectTrigger id="appearance-timezone" className="w-full sm:w-64">
              <SelectValue placeholder="选择时区" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
              <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>订单时间与流量统计按该时区展示。</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>紧凑表格</FieldTitle>
            <FieldDescription>减小表格行高，单屏显示更多订单。</FieldDescription>
          </FieldContent>
          <Switch
            checked={compact}
            onCheckedChange={setCompact}
            aria-label="紧凑表格"
          />
        </Field>
      </FieldGroup>
    </div>
  )
}

/* -------------------------------- API Token ------------------------------- */

type ApiToken = (typeof apiTokens)[number]

const tokenColumns: ColumnDef<ApiToken, unknown>[] = [
  {
    accessorKey: 'name',
    header: '名称',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
  },
  {
    accessorKey: 'prefix',
    header: 'Token 前缀',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{row.original.prefix}</span>
    )
  },
  {
    id: 'scopes',
    header: '权限',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.scopes.map((scope) => (
          <Badge key={scope} variant="outline">
            {scope}
          </Badge>
        ))}
      </div>
    )
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{formatDay(row.original.createdAt)}</span>
    )
  },
  {
    accessorKey: 'lastUsedAt',
    header: '最后使用',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {row.original.lastUsedAt ? formatDay(row.original.lastUsedAt) : '从未使用'}
      </span>
    )
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${row.original.name} 操作`}>
              <MoreHorizontal data-icon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard
                  .writeText(row.original.prefix)
                  .then(() => toast.success('已复制 Token 前缀'))
                  .catch(() => toast.error('复制失败，请手动选择文本'))
              }}
            >
              <Copy data-icon aria-hidden="true" />
              复制前缀
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => toast.warning('演示环境：Token 删除接口未接入')}
            >
              <Trash2 data-icon aria-hidden="true" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }
]

export function TokenPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">API Token</p>
          <p className="text-xs text-muted-foreground">
            用于脚本调用 /api/v1 接口，Token 只在创建时展示一次。
          </p>
        </div>
        <Button onClick={() => toast.info('演示环境：Token 创建接口未接入')}>
          <Plus data-icon aria-hidden="true" />
          新建 Token
        </Button>
      </div>

      <DataTable columns={tokenColumns} data={apiTokens} emptyTitle="还没有创建 Token" />
    </div>
  )
}
