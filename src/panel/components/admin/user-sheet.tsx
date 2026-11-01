'use client'

import { useState } from 'react'
import { Ban, LogOut, Save, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/empty-state'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { QuotaBar } from '@/components/common/quota-bar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/common/state-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatMoney } from '@/lib/format'
import {
  useAdjustBalance,
  useKickSession,
  useUpdateUser,
  useUserSessions,
  type AdminUserDto
} from '@/lib/api/admin'

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

const statusLabels: Record<AdminUserDto['status'], string> = {
  active: '正常',
  pending: '未验证',
  disabled: '已封禁'
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return '未知设备'
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS 设备'
  if (/android/i.test(userAgent)) return 'Android 设备'
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac'
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/linux/i.test(userAgent)) return 'Linux'
  return '其他设备'
}

function browserLabel(userAgent: string | null) {
  if (!userAgent) return '—'
  if (/edg\//i.test(userAgent)) return 'Edge'
  if (/chrome\//i.test(userAgent)) return 'Chrome'
  if (/firefox\//i.test(userAgent)) return 'Firefox'
  if (/safari\//i.test(userAgent)) return 'Safari'
  return '未知浏览器'
}

interface UserSheetProps {
  user: AdminUserDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserSheet({ user, open, onOpenChange }: UserSheetProps) {
  if (!user) return null
  return <UserSheetBody key={user.id} user={user} open={open} onOpenChange={onOpenChange} />
}

function UserSheetBody({ user, open, onOpenChange }: Omit<UserSheetProps, 'user'> & { user: AdminUserDto }) {
  const [username, setUsername] = useState(user.username)
  const [roleCode, setRoleCode] = useState(user.roleCode)
  const [status, setStatus] = useState<AdminUserDto['status']>(user.status)
  const [remark, setRemark] = useState(user.remark ?? '')
  const [balance, setBalance] = useState(user.balance)
  const [amount, setAmount] = useState('10.00')
  const [balanceNote, setBalanceNote] = useState('')
  const [banReason, setBanReason] = useState(user.remark ?? '')

  const sessions = useUserSessions(open ? user.id : null)
  const updateUser = useUpdateUser()
  const adjustBalance = useAdjustBalance()
  const kickSession = useKickSession(user.id)

  const banned = status === 'disabled'
  const roleOptions = Array.from(new Set(['user', 'admin', 'superadmin', roleCode]))

  function saveProfile() {
    updateUser.mutate(
      { id: user.id, username, roleCode, status, remark: remark.trim() || null },
      {
        onSuccess: () => toast.success('已保存用户资料'),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function changeBalance(direction: 1 | -1) {
    const value = Math.abs(Number(amount))
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('请输入大于 0 的调整金额')
      return
    }
    if (!balanceNote.trim()) {
      toast.error('请填写调整原因')
      return
    }
    adjustBalance.mutate(
      { id: user.id, amount: (value * direction).toFixed(2), reason: balanceNote.trim() },
      {
        onSuccess: (data) => {
          setBalance(data.balance)
          setBalanceNote('')
          toast.success(`余额已${direction > 0 ? '增加' : '扣减'} ${formatMoney(value)}`)
        },
        onError: (error) => toast.error(error.message)
      }
    )
  }

  function toggleBan() {
    const next = banned ? 'active' : 'disabled'
    updateUser.mutate(
      { id: user.id, status: next, remark: banReason.trim() || null },
      {
        onSuccess: () => {
          setStatus(next)
          toast.success(banned ? `已解除 ${user.email} 的封禁` : `已封禁 ${user.email}，会话已失效`)
        },
        onError: (error) => toast.error(error.message)
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {user.username}
            <Badge
              variant={
                user.roleCode === 'superadmin' ? 'default' : user.roleCode === 'admin' ? 'info' : 'secondary'
              }
            >
              {roleLabels[user.roleCode] ?? user.roleCode}
            </Badge>
            <StateBadge status={statusBadge[status]} />
          </SheetTitle>
          <SheetDescription className="font-mono">{user.email}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <Tabs defaultValue="profile">
            <TabsList className="w-full">
              <TabsTrigger value="profile">资料</TabsTrigger>
              <TabsTrigger value="sessions">会话</TabsTrigger>
              <TabsTrigger value="balance">余额</TabsTrigger>
              <TabsTrigger value="ban">封禁</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="pt-4">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="user-username">用户名</FieldLabel>
                  <Input
                    id="user-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>用户 ID</FieldLabel>
                  <p className="font-mono text-xs break-all">{user.id}</p>
                </Field>
                <Field>
                  <FieldLabel>邮箱</FieldLabel>
                  <p className="text-sm">{user.email}</p>
                </Field>
                <Field>
                  <FieldLabel>注册时间</FieldLabel>
                  <p className="text-sm">{formatDate(user.createdAt)}</p>
                </Field>
                <Field>
                  <FieldLabel>最近登录</FieldLabel>
                  <p className="text-sm">{formatDate(user.lastLoginAt)}</p>
                </Field>
                <Field>
                  <FieldLabel>账户余额</FieldLabel>
                  <p className="font-mono text-sm tabular-nums">{formatMoney(balance)}</p>
                </Field>
                <Field>
                  <FieldLabel>角色</FieldLabel>
                  <Select value={roleCode} onValueChange={setRoleCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((code) => (
                        <SelectItem key={code} value={code}>
                          {roleLabels[code] ?? code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>状态</FieldLabel>
                  <Select value={status} onValueChange={(value) => setStatus(value as AdminUserDto['status'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['active', 'pending', 'disabled'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {statusLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>流量用量</FieldLabel>
                  <QuotaBar used={user.trafficUsed} limit={user.trafficLimit} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="user-remark">备注</FieldLabel>
                  <Textarea
                    id="user-remark"
                    rows={2}
                    value={remark}
                    onChange={(event) => setRemark(event.target.value)}
                    placeholder="内部备注，仅管理员可见"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button onClick={saveProfile} disabled={updateUser.isPending}>
                    <Save data-icon="inline-start" />
                    保存资料
                  </Button>
                </div>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="sessions" className="flex flex-col gap-3 pt-4">
              {sessions.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (sessions.data ?? []).length === 0 ? (
                <EmptyState title="暂无活跃会话" description="用户被封禁或已强制下线" icon={LogOut} />
              ) : (
                (sessions.data ?? []).map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {deviceLabel(session.userAgent)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {browserLabel(session.userAgent)}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {session.ip ?? '未知 IP'} · 最近活跃 {formatDate(session.lastSeenAt)} · 创建{' '}
                        {formatDate(session.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.current ? <Badge variant="success">当前会话</Badge> : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={kickSession.isPending}
                        onClick={() =>
                          kickSession.mutate(session.id, {
                            onSuccess: () => toast.success('已强制下线该会话'),
                            onError: (error) => toast.error(error.message)
                          })
                        }
                      >
                        <LogOut data-icon="inline-start" />
                        强制下线
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="balance" className="pt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>当前余额</FieldLabel>
                  <p className="font-mono text-lg tabular-nums">{formatMoney(balance)}</p>
                  <FieldDescription>余额调整会写入审计日志，操作者与原因都会留痕。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="balance-amount">调整金额（元）</FieldLabel>
                  <Input
                    id="balance-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="balance-note">备注</FieldLabel>
                  <Input
                    id="balance-note"
                    value={balanceNote}
                    onChange={(event) => setBalanceNote(event.target.value)}
                    placeholder="如：工单补偿"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={adjustBalance.isPending} onClick={() => changeBalance(1)}>
                    <Wallet data-icon="inline-start" />
                    增加余额
                  </Button>
                  <Button
                    variant="outline"
                    disabled={adjustBalance.isPending}
                    onClick={() => changeBalance(-1)}
                  >
                    扣减余额
                  </Button>
                </div>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="ban" className="pt-4">
              <FieldGroup>
                <Alert variant={banned ? 'default' : 'destructive'}>
                  <Ban data-icon="inline-start" />
                  <AlertTitle>{banned ? '该账号已被封禁' : '封禁将立即失效所有会话'}</AlertTitle>
                  <AlertDescription>
                    封禁后用户无法登录，会话会被立即清除。解封后需重新登录。
                  </AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel htmlFor="ban-reason">封禁原因</FieldLabel>
                  <Textarea
                    id="ban-reason"
                    value={banReason}
                    onChange={(event) => setBanReason(event.target.value)}
                    placeholder="如：滥用退款、共享账号、恶意刷流量"
                  />
                </Field>
                <Button
                  variant={banned ? 'outline' : 'destructive'}
                  disabled={updateUser.isPending}
                  onClick={toggleBan}
                >
                  {banned ? <ShieldCheck data-icon="inline-start" /> : <Ban data-icon="inline-start" />}
                  {banned ? '解除封禁' : '封禁账号'}
                </Button>
              </FieldGroup>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
