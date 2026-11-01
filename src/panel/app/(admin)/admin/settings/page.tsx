'use client'

import { useState } from 'react'
import { CreditCard, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  MailSettingsForm,
  normalizeMailSettings,
  serializeMailSettings
} from '@/components/admin/mail-settings-form'
import {
  useAdminSettings,
  useSaveSettings,
  type MailSettingsDto,
  type SettingsDto
} from '@/lib/api/admin'
import { allPermissionPoints, roleMatrix } from '@/lib/mock/admin-ops'

type Section = 'site' | 'register' | 'payment' | 'mail'
type SaveMutation = ReturnType<typeof useSaveSettings>

export default function AdminSettingsPage() {
  const { data, isLoading, isError, error } = useAdminSettings()
  const save = useSaveSettings()

  if (isLoading) {
    return (
      <>
        <PageHeader title="系统设置" description="站点信息、注册策略、支付渠道、邮件与角色权限" />
        <Skeleton className="h-96 w-full" />
      </>
    )
  }

  if (isError || !data) {
    return (
      <>
        <PageHeader title="系统设置" description="站点信息、注册策略、支付渠道、邮件与角色权限" />
        <p className="text-sm text-destructive">
          加载失败：{isError ? (error as Error).message : '设置数据为空'}
        </p>
      </>
    )
  }

  return <SettingsForm initial={data} save={save} />
}

function SettingsForm({ initial, save }: { initial: SettingsDto; save: SaveMutation }) {
  const [site, setSite] = useState<SettingsDto['site']>(initial.site)
  const [registration, setRegistration] = useState<SettingsDto['register']>(initial.register)
  const [payment, setPayment] = useState<SettingsDto['payment']>(initial.payment)
  const [mail, setMail] = useState<MailSettingsDto>(() => normalizeMailSettings(initial.mail))

  function persist(label: string, body: Partial<SettingsDto>) {
    save.mutate(body, {
      onSuccess: () => toast.success(`${label}已保存`),
      onError: (mutationError) => toast.error(`保存失败：${mutationError.message}`)
    })
  }

  function saveSection(section: Section, label: string) {
    if (section === 'site') persist(label, { site })
    if (section === 'register') persist(label, { register: registration })
    if (section === 'payment') persist(label, { payment })
    if (section === 'mail') persist(label, { mail: serializeMailSettings(mail) })
  }

  function saveAll() {
    persist('系统设置', {
      site,
      register: registration,
      payment,
      mail: serializeMailSettings(mail)
    })
  }

  return (
    <>
      <PageHeader
        title="系统设置"
        description="站点信息、注册策略、支付渠道、邮件与角色权限"
        actions={
          <Button variant="outline" onClick={saveAll} disabled={save.isPending}>
            <Save data-icon="inline-start" />
            保存全部
          </Button>
        }
      />

      <Tabs defaultValue="site">
        <TabsList>
          <TabsTrigger value="site">站点</TabsTrigger>
          <TabsTrigger value="registration">注册</TabsTrigger>
          <TabsTrigger value="payment">支付</TabsTrigger>
          <TabsTrigger value="email">邮件</TabsTrigger>
          <TabsTrigger value="permissions">权限</TabsTrigger>
        </TabsList>

        <TabsContent value="site" className="pt-4">
          <div className="max-w-2xl">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="site-name">站点名称</FieldLabel>
                <Input
                  id="site-name"
                  value={site.name}
                  onChange={(event) => setSite({ ...site, name: event.target.value })}
                />
                <FieldDescription>展示在浏览器标题、邮件签名与订阅页页脚。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="site-logo">Logo 地址</FieldLabel>
                <Input
                  id="site-logo"
                  value={site.logo}
                  onChange={(event) => setSite({ ...site, logo: event.target.value })}
                  placeholder="https://cdn.example.com/logo.svg"
                />
                <FieldDescription>仅支持 https 外链，建议 SVG 或 2x PNG。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="site-announcement">公告</FieldLabel>
                <Textarea
                  id="site-announcement"
                  value={site.announcement}
                  onChange={(event) => setSite({ ...site, announcement: event.target.value })}
                  rows={4}
                />
                <FieldDescription>显示在用户中心顶部，支持纯文本。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="site-icp">备案信息</FieldLabel>
                <Input
                  id="site-icp"
                  value={site.icp}
                  onChange={(event) => setSite({ ...site, icp: event.target.value })}
                />
              </Field>
              <div>
                <Button onClick={() => saveSection('site', '站点设置')} disabled={save.isPending}>
                  <Save data-icon="inline-start" />
                  保存站点设置
                </Button>
              </div>
            </FieldGroup>
          </div>
        </TabsContent>

        <TabsContent value="registration" className="pt-4">
          <div className="max-w-2xl">
            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  id="registration-open"
                  checked={registration.open}
                  onCheckedChange={(checked) => setRegistration({ ...registration, open: checked })}
                />
                <FieldContent>
                  <FieldLabel htmlFor="registration-open">开放注册</FieldLabel>
                  <FieldDescription>关闭后仅管理员可以手动创建账号。</FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  id="registration-email-verify"
                  checked={registration.emailVerify}
                  onCheckedChange={(checked) => setRegistration({ ...registration, emailVerify: checked })}
                />
                <FieldContent>
                  <FieldLabel htmlFor="registration-email-verify">邮箱验证</FieldLabel>
                  <FieldDescription>注册后必须完成邮箱验证才能登录。</FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="registration-gift">赠送流量（GB）</FieldLabel>
                <Input
                  id="registration-gift"
                  inputMode="numeric"
                  value={String(registration.giftTrafficGb)}
                  onChange={(event) =>
                    setRegistration({
                      ...registration,
                      giftTrafficGb: Number(event.target.value) || 0
                    })
                  }
                />
                <FieldDescription>新用户注册后自动到账的体验流量，填 0 表示不赠送。</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  id="registration-invite"
                  checked={registration.inviteRequired}
                  onCheckedChange={(checked) =>
                    setRegistration({ ...registration, inviteRequired: checked })
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="registration-invite">仅邀请码注册</FieldLabel>
                  <FieldDescription>开启后注册必须填写有效邀请码。</FieldDescription>
                </FieldContent>
              </Field>
              <div>
                <Button onClick={() => saveSection('register', '注册设置')} disabled={save.isPending}>
                  <Save data-icon="inline-start" />
                  保存注册设置
                </Button>
              </div>
            </FieldGroup>
          </div>
        </TabsContent>

        <TabsContent value="payment" className="pt-4">
          <div className="grid max-w-3xl gap-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard data-icon="inline-start" className="size-4 text-muted-foreground" />
                    <CardTitle className="text-base">易支付</CardTitle>
                    <Badge variant="outline">epay</Badge>
                  </div>
                  <Switch
                    checked={payment.epayEnabled}
                    aria-label="易支付启用开关"
                    onCheckedChange={(checked) => setPayment({ ...payment, epayEnabled: checked })}
                  />
                </div>
                <CardDescription>聚合网关渠道开关，商户密钥由支付插件配置。</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard data-icon="inline-start" className="size-4 text-muted-foreground" />
                    <CardTitle className="text-base">Stripe</CardTitle>
                    <Badge variant="outline">stripe</Badge>
                  </div>
                  <Switch
                    checked={payment.stripeEnabled}
                    aria-label="Stripe 启用开关"
                    onCheckedChange={(checked) => setPayment({ ...payment, stripeEnabled: checked })}
                  />
                </div>
                <CardDescription>Stripe 渠道开关，API Key 与 Webhook 由支付插件配置。</CardDescription>
              </CardHeader>
            </Card>

            <div>
              <Button onClick={() => saveSection('payment', '支付设置')} disabled={save.isPending}>
                <Save data-icon="inline-start" />
                保存支付设置
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email" className="pt-4">
          <div className="max-w-2xl">
            <MailSettingsForm value={mail} onChange={setMail} disabled={save.isPending} />
            <div className="mt-5">
              <Button onClick={() => saveSection('mail', '邮件设置')} disabled={save.isPending}>
                <Save data-icon="inline-start" />
                保存邮件设置
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="pt-4">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {roleMatrix.map((role) => (
                <Card key={role.role}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{role.label}</CardTitle>
                      <Badge
                        variant={role.role === 'superadmin' ? 'default' : role.role === 'admin' ? 'info' : 'secondary'}
                      >
                        {role.role}
                      </Badge>
                    </div>
                    <CardDescription>{role.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {role.permissions[0] === '*' ? (
                      <Badge variant="success">
                        <ShieldCheck data-icon="inline-start" />
                        全部权限点
                      </Badge>
                    ) : role.permissions.length === 0 ? (
                      <span className="text-sm text-muted-foreground">无管理权限</span>
                    ) : (
                      role.permissions.map((permission) => (
                        <Badge key={permission} variant="outline" className="font-mono text-[11px]">
                          {permission}
                        </Badge>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">全部权限点</CardTitle>
                <CardDescription>
                  只读展示，权限点定义在 packages/contracts，前端菜单与后端校验共用同一份。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {allPermissionPoints.map((permission) => (
                  <Badge key={permission} variant="outline" className="font-mono text-[11px]">
                    {permission}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <span className="text-xs text-muted-foreground">保存后立即生效，敏感字段变更会记录审计日志。</span>
        <Button onClick={saveAll} disabled={save.isPending}>
          <Save data-icon="inline-start" />
          保存
        </Button>
      </div>
    </>
  )
}
