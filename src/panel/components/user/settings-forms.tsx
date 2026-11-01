'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, KeyRound, MonitorSmartphone, Palette, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/data-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiClientError, apiFetch, queryKeys } from '@/lib/api/client'
import type { ProfileDto, SessionDto, TokenCreatedDto, TokenDto } from '@/lib/api/types'
import { TOKEN_SCOPES } from '@/lib/api/types'
import { formatDate, formatRelative } from '@/lib/format'

/** 从 ApiClientError 里取字段名，用于把服务端 4xx 落到具体输入框 */
function fieldOf(error: unknown) {
  if (!(error instanceof ApiClientError)) return ''
  const field = error.payload.data?.field
  return typeof field === 'string' ? field : ''
}

function toastError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    toast.error(fallback, { description: error.message })
    return
  }
  toast.error(fallback, { description: '请稍后重试' })
}

/* ---------------------------------- 资料 ---------------------------------- */

export function ProfileForm() {
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfileDto>('/api/v1/user/profile')
  })

  if (profile.isPending) return <Skeleton className="h-64 w-full" />
  if (profile.isError) {
    return (
      <Alert variant="destructive">
        <ShieldAlert data-icon aria-hidden="true" />
        <AlertTitle>资料加载失败</AlertTitle>
        <AlertDescription>请刷新页面重试。</AlertDescription>
      </Alert>
    )
  }

  const data = profile.data

  // 服务端资料变化时用 key 重建表单，避免在 effect 里同步 state
  return (
    <ProfileEditor key={`${data.id}:${data.username}:${data.telegramId ?? ''}`} data={data} />
  )
}

function ProfileEditor({ data }: { data: ProfileDto }) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(data.username)
  const [telegramId, setTelegramId] = useState(data.telegramId ?? '')
  const [errors, setErrors] = useState<{ username?: string; telegramId?: string }>({})

  const save = useMutation({
    mutationFn: (body: { username: string; telegramId: string | null }) =>
      apiFetch<ProfileDto>('/api/v1/user/profile', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated)
      setErrors({})
      toast.success('个人资料已保存')
    },
    onError: (error) => {
      const field = fieldOf(error)
      if (field === 'username' || field === 'telegramId') {
        setErrors({ [field]: error instanceof ApiClientError ? error.message : '保存失败' })
      }
      toastError(error, '保存失败')
    }
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextUsername = username.trim()
    const nextTelegram = telegramId.trim()

    const nextErrors: typeof errors = {}
    if (nextUsername.length < 2) nextErrors.username = '用户名至少 2 位'
    else if (nextUsername.length > 32) nextErrors.username = '用户名最多 32 位'
    if (nextTelegram.length > 64) nextErrors.telegramId = 'Telegram 最多 64 位'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    save.mutate({ username: nextUsername, telegramId: nextTelegram || null })
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.username)}>
            <FieldLabel htmlFor="profile-username">用户名</FieldLabel>
            <Input
              id="profile-username"
              value={username}
              autoComplete="username"
              aria-invalid={Boolean(errors.username)}
              onChange={(event) => setUsername(event.target.value)}
            />
            <FieldDescription>唯一，大小写不敏感；用于工单与通知展示。</FieldDescription>
            <FieldError errors={errors.username ? [{ message: errors.username }] : undefined} />
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-email">邮箱</FieldLabel>
            <Input id="profile-email" value={data.email} readOnly />
            <FieldDescription>登录凭证，不可修改。</FieldDescription>
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.telegramId)}>
          <FieldLabel htmlFor="profile-telegram">Telegram</FieldLabel>
          <Input
            id="profile-telegram"
            value={telegramId}
            placeholder="@username"
            aria-invalid={Boolean(errors.telegramId)}
            onChange={(event) => setTelegramId(event.target.value)}
          />
          <FieldDescription>留空表示未绑定；Telegram 通知接入后用于接收提醒。</FieldDescription>
          <FieldError errors={errors.telegramId ? [{ message: errors.telegramId }] : undefined} />
        </Field>

        <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground sm:grid-cols-3">
          <span>
            角色：<span className="font-mono tabular-nums">{data.roleCode}</span>
          </span>
          <span>注册于 {formatDate(data.createdAt)}</span>
          <span>最近登录 {formatDate(data.lastLoginAt)}</span>
        </div>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? '保存中…' : '保存修改'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            setUsername(data.username)
            setTelegramId(data.telegramId ?? '')
            setErrors({})
          }}
        >
          重置
        </Button>
      </div>
    </form>
  )
}

/* ---------------------------------- 安全 ---------------------------------- */

export function SecurityForm() {
  const queryClient = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  }>({})

  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfileDto>('/api/v1/user/profile')
  })

  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => apiFetch<SessionDto[]>('/api/v1/user/sessions')
  })

  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: true }>('/api/v1/user/password', { method: 'POST', body }),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setErrors({})
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('密码已更新', { description: '其他设备上的登录会话已被吊销' })
    },
    onError: (error) => {
      const field = fieldOf(error)
      if (field === 'currentPassword' || field === 'newPassword') {
        setErrors({ [field]: error instanceof ApiClientError ? error.message : '修改失败' })
      }
      toastError(error, '修改密码失败')
    }
  })

  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/v1/user/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('该设备已下线')
    },
    onError: (error) => toastError(error, '下线失败')
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors: typeof errors = {}
    if (!currentPassword) nextErrors.currentPassword = '请输入当前密码'
    if (newPassword.length < 8) nextErrors.newPassword = '新密码至少需要 8 位字符'
    else if (newPassword === currentPassword) nextErrors.newPassword = '新密码不能与当前密码相同'
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = '两次输入的新密码不一致'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    changePassword.mutate({ currentPassword, newPassword })
  }

  return (
    <div className="flex flex-col gap-8">
      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.currentPassword)}>
            <FieldLabel htmlFor="security-current">当前密码</FieldLabel>
            <Input
              id="security-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              aria-invalid={Boolean(errors.currentPassword)}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <FieldError
              errors={errors.currentPassword ? [{ message: errors.currentPassword }] : undefined}
            />
          </Field>

          <Field data-invalid={Boolean(errors.newPassword)}>
            <FieldLabel htmlFor="security-new">新密码</FieldLabel>
            <Input
              id="security-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              aria-invalid={Boolean(errors.newPassword)}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <FieldDescription>至少 8 位，建议包含大小写字母与数字。</FieldDescription>
            <FieldError errors={errors.newPassword ? [{ message: errors.newPassword }] : undefined} />
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="security-confirm">确认新密码</FieldLabel>
            <Input
              id="security-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              aria-invalid={Boolean(errors.confirmPassword)}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <FieldError
              errors={errors.confirmPassword ? [{ message: errors.confirmPassword }] : undefined}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>两步验证</FieldTitle>
              <FieldDescription>
                暂未开放。TOTP 与恢复码仍在规划中，开启后登录需要额外输入一次性验证码。
              </FieldDescription>
            </FieldContent>
            <Switch
              checked={profile.data?.twoFactorEnabled ?? false}
              disabled
              aria-label="两步验证（暂未开放）"
            />
          </Field>
        </FieldGroup>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? '更新中…' : '更新密码'}
          </Button>
          <span className="text-xs text-muted-foreground">
            修改成功后，除当前设备外的登录会话会全部失效。
          </span>
        </div>
      </form>

      <FieldSeparator />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="size-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-medium">登录设备</h3>
          </div>
          {sessions.data ? (
            <span className="text-xs text-muted-foreground">
              共 <span className="font-mono tabular-nums">{sessions.data.length}</span> 个会话
            </span>
          ) : null}
        </div>

        {sessions.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {sessions.isError ? (
          <p className="text-xs text-muted-foreground">登录设备加载失败，请刷新重试。</p>
        ) : null}

        {sessions.data && sessions.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">当前没有有效会话。</p>
        ) : null}

        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          {(sessions.data ?? []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs tabular-nums">{item.ip ?? '未知 IP'}</span>
                  {item.current ? <Badge variant="secondary">当前设备</Badge> : null}
                </div>
                <p
                  className="mt-1 max-w-md truncate text-xs text-muted-foreground"
                  title={item.userAgent ?? undefined}
                >
                  {item.userAgent ?? '未记录浏览器信息'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  最近活跃 {formatRelative(item.lastSeenAt)} · 过期 {formatDate(item.expiresAt)}
                </p>
              </div>
              {item.current ? (
                <span className="text-xs text-muted-foreground">当前会话不可在此下线</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(item.id)}
                >
                  吊销
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
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
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <ShieldAlert data-icon aria-hidden="true" />
        <AlertTitle>通知偏好暂未接入</AlertTitle>
        <AlertDescription>
          当前没有存储通知偏好的数据表，下面的开关仅作展示，不会保存。接入后会在本页开启。
        </AlertDescription>
      </Alert>

      <FieldGroup>
        {NOTIFICATION_ITEMS.map((item) => (
          <Field key={item.key} orientation="horizontal">
            <FieldContent>
              <FieldTitle>{item.title}</FieldTitle>
              <FieldDescription>{item.description}</FieldDescription>
            </FieldContent>
            <Switch checked={false} disabled aria-label={`${item.title}（暂未接入）`} />
          </Field>
        ))}
      </FieldGroup>
    </div>
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
          <Select defaultValue="zh-CN" disabled>
            <SelectTrigger id="appearance-language" className="w-full sm:w-64">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>语言切换暂未接入持久化，当前固定为简体中文。</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="appearance-timezone">时区</FieldLabel>
          <Select defaultValue="Asia/Shanghai" disabled>
            <SelectTrigger id="appearance-timezone" className="w-full sm:w-64">
              <SelectValue placeholder="选择时区" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
              <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>订单时间与流量统计按站点默认时区展示，暂不支持自定义。</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>紧凑表格</FieldTitle>
            <FieldDescription>仅作用于当前页面，暂未持久化。</FieldDescription>
          </FieldContent>
          <Switch checked={compact} onCheckedChange={setCompact} aria-label="紧凑表格" />
        </Field>
      </FieldGroup>
    </div>
  )
}

/* -------------------------------- API Token ------------------------------- */

const EXPIRES_OPTIONS = [
  { value: '30', label: '30 天' },
  { value: '90', label: '90 天' },
  { value: '365', label: '1 年' },
  { value: 'never', label: '永不过期' }
] as const

function toTokenColumns(
  onRevoke: (id: string) => void,
  revoking: boolean
): ColumnDef<TokenDto, unknown>[] {
  return [
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
      cell: ({ row }) =>
        row.original.scopes.length === 0 ? (
          <span className="text-xs text-muted-foreground">未授权</span>
        ) : (
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
        <span className="font-mono text-xs tabular-nums">{formatDate(row.original.createdAt)}</span>
      )
    },
    {
      accessorKey: 'lastUsedAt',
      header: '最后使用',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">
          {row.original.lastUsedAt ? formatDate(row.original.lastUsedAt) : '从未使用'}
        </span>
      )
    },
    {
      accessorKey: 'expiresAt',
      header: '过期时间',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">
          {row.original.expiresAt ? formatDate(row.original.expiresAt) : '永不'}
        </span>
      )
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) =>
        row.original.revokedAt ? (
          <Badge variant="destructive">已吊销</Badge>
        ) : (
          <Badge variant="secondary">有效</Badge>
        )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={revoking || Boolean(row.original.revokedAt)}
            onClick={() => onRevoke(row.original.id)}
          >
            <Trash2 data-icon aria-hidden="true" />
            吊销
          </Button>
        </div>
      )
    }
  ]
}

export function TokenPanel() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [expires, setExpires] = useState<string>('90')
  const [created, setCreated] = useState<TokenCreatedDto | null>(null)

  const tokens = useQuery({
    queryKey: queryKeys.tokens,
    queryFn: () => apiFetch<TokenDto[]>('/api/v1/user/tokens')
  })

  const create = useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expiresInDays: number | null }) =>
      apiFetch<TokenCreatedDto>('/api/v1/user/tokens', { method: 'POST', body }),
    onSuccess: (token) => {
      setCreated(token)
      setName('')
      setScopes([])
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens })
      toast.success('Token 已创建', { description: '明文只展示这一次，请立即复制保存' })
    },
    onError: (error) => toastError(error, '创建 Token 失败')
  })

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/user/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens })
      toast.success('Token 已吊销')
    },
    onError: (error) => toastError(error, '吊销 Token 失败')
  })

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('请填写 Token 名称')
      return
    }
    create.mutate({
      name: trimmed,
      scopes,
      expiresInDays: expires === 'never' ? null : Number(expires)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <Alert>
          <KeyRound data-icon aria-hidden="true" />
          <AlertTitle>请立即复制这个 Token，之后无法再次查看</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex flex-col gap-2">
              <code className="break-all rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                {created.token}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(created.token)
                      .then(() => toast.success('Token 已复制'))
                      .catch(() => toast.error('复制失败，请手动选择文本'))
                  }}
                >
                  <Copy data-icon aria-hidden="true" />
                  复制
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreated(null)}>
                  我已保存
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="flex flex-col gap-4 rounded-lg border border-border p-4" onSubmit={handleCreate}>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field>
            <FieldLabel htmlFor="token-name">Token 名称</FieldLabel>
            <Input
              id="token-name"
              value={name}
              placeholder="例如：监控脚本"
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldDescription>用于区分用途，随时可以吊销。</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="token-expires">有效期</FieldLabel>
            <Select value={expires} onValueChange={setExpires}>
              <SelectTrigger id="token-expires" className="w-full sm:w-36">
                <SelectValue placeholder="选择有效期" />
              </SelectTrigger>
              <SelectContent>
                {EXPIRES_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field>
          <FieldLabel>权限范围</FieldLabel>
          <div className="flex flex-wrap gap-4">
            {TOKEN_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) =>
                    setScopes((previous) =>
                      checked === true
                        ? [...previous, scope]
                        : previous.filter((item) => item !== scope)
                    )
                  }
                />
                <span className="font-mono text-xs tabular-nums">{scope}</span>
              </label>
            ))}
          </div>
          <FieldDescription>不勾选表示只用于身份识别，不授予任何接口权限。</FieldDescription>
        </Field>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={create.isPending}>
            <Plus data-icon aria-hidden="true" />
            {create.isPending ? '创建中…' : '创建 Token'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Token 只保存哈希，明文仅创建时返回一次。
          </span>
        </div>
      </form>

      {tokens.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {tokens.isError ? (
        <p className="text-xs text-muted-foreground">Token 列表加载失败，请刷新重试。</p>
      ) : null}
      {tokens.data ? (
        <DataTable
          columns={toTokenColumns((id) => revoke.mutate(id), revoke.isPending)}
          data={tokens.data}
          emptyTitle="还没有创建 Token"
          emptyDescription="创建后可用于后续接入的开放接口。"
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        Token 与权限范围已入库，PAT 鉴权会随开放接口一并接入；在此之前，Token 无法直接调用现有会话接口。
      </p>
    </div>
  )
}
