'use client'

import { useState } from 'react'
import { Ban, LogOut, ShieldCheck, Wallet } from 'lucide-react'
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
import { StateBadge } from '@/components/common/state-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatBytes, formatDate, formatMoney } from '@/lib/format'
import type { AdminUser, UserRole } from '@/lib/mock/admin-ops'
import { plans, subscriptions } from '@/lib/mock/catalog'

const roleLabels: Record<UserRole, string> = {
  user: '普通用户',
  admin: '管理员',
  superadmin: '超级管理员'
}

interface UserSheetProps {
  user: AdminUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserSheet({ user, open, onOpenChange }: UserSheetProps) {
  const [amount, setAmount] = useState('10.00')
  const [balanceNote, setBalanceNote] = useState('')
  const [planId, setPlanId] = useState(plans[1]?.id ?? '')
  const [days, setDays] = useState('30')
  const [banReason, setBanReason] = useState('')

  if (!user) return null

  const banned = user.status === 'banned'
  const currentSub = subscriptions.find((sub) => sub.userEmail === user.email)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {user.username}
            <Badge variant={user.role === 'superadmin' ? 'default' : user.role === 'admin' ? 'info' : 'secondary'}>
              {roleLabels[user.role]}
            </Badge>
            <StateBadge status={user.status} />
          </SheetTitle>
          <SheetDescription className="font-mono">{user.email}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <Tabs defaultValue="profile" key={user.id}>
            <TabsList className="w-full">
              <TabsTrigger value="profile">资料</TabsTrigger>
              <TabsTrigger value="sessions">会话</TabsTrigger>
              <TabsTrigger value="balance">余额</TabsTrigger>
              <TabsTrigger value="subscription">订阅</TabsTrigger>
              <TabsTrigger value="ban">封禁</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="pt-4">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>用户名</FieldLabel>
                  <p className="text-sm">{user.username}</p>
                </Field>
                <Field>
                  <FieldLabel>用户 ID</FieldLabel>
                  <p className="font-mono text-sm">{user.id}</p>
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
                  <p className="font-mono text-sm tabular-nums">{formatMoney(user.balance)}</p>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>流量用量</FieldLabel>
                  <QuotaBar used={user.trafficUsed} limit={user.trafficLimit} />
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="sessions" className="flex flex-col gap-3 pt-4">
              {user.sessions.length === 0 ? (
                <EmptyState title="暂无活跃会话" description="用户被封禁或已强制下线" icon={LogOut} />
              ) : (
                user.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {session.device}
                        <span className="ml-2 text-xs text-muted-foreground">{session.browser}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {session.ip} · {session.location} · {formatDate(session.lastActiveAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.current ? <Badge variant="success">当前会话</Badge> : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.success(`已下线会话 ${session.device}`)}
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
                  <p className="font-mono text-lg tabular-nums">{formatMoney(user.balance)}</p>
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
                  <Button onClick={() => toast.success(`已为 ${user.email} 增加 ${formatMoney(amount || 0)}`)}>
                    <Wallet data-icon="inline-start" />
                    增加余额
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast.success(`已从 ${user.email} 扣减 ${formatMoney(amount || 0)}`)}
                  >
                    扣减余额
                  </Button>
                </div>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="subscription" className="pt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>当前订阅</FieldLabel>
                  {currentSub ? (
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{currentSub.planName}</span>
                        <StateBadge status={currentSub.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        到期 {formatDate(currentSub.expireAt)} · 已用 {formatBytes(currentSub.trafficUsed)} /{' '}
                        {formatBytes(currentSub.trafficLimit)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">该用户还没有订阅</p>
                  )}
                </Field>
                <Field>
                  <FieldLabel>开通套餐</FieldLabel>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择套餐" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} · {formatMoney(plan.price)} / {plan.durationDays} 天
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sub-days">时长（天）</FieldLabel>
                  <Input id="sub-days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
                  <FieldDescription>手动开通不走支付流程，会直接生成生效中的订阅。</FieldDescription>
                </Field>
                <Button onClick={() => toast.success(`已为 ${user.email} 开通 ${days} 天订阅`)}>
                  <ShieldCheck data-icon="inline-start" />
                  手动开通订阅
                </Button>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="ban" className="pt-4">
              <FieldGroup>
                <Alert variant={banned ? 'default' : 'destructive'}>
                  <Ban data-icon="inline-start" />
                  <AlertTitle>{banned ? '该账号已被封禁' : '封禁将立即失效所有会话'}</AlertTitle>
                  <AlertDescription>
                    封禁后用户无法登录，订阅链接同时停止下发。解封需要管理员二次确认。
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
                  onClick={() =>
                    toast.success(banned ? `已解除 ${user.email} 的封禁` : `已封禁 ${user.email}`)
                  }
                >
                  <Ban data-icon="inline-start" />
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
