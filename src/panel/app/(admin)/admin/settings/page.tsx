'use client'

import { useState } from 'react'
import { CreditCard, Save, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  allPermissionPoints,
  emailSettings,
  paymentChannels,
  registrationSettings,
  roleMatrix,
  siteSettings
} from '@/lib/mock/admin-ops'

export default function AdminSettingsPage() {
  const [site, setSite] = useState(siteSettings)
  const [registration, setRegistration] = useState(registrationSettings)
  const [channels, setChannels] = useState(paymentChannels)
  const [email, setEmail] = useState(emailSettings)
  const [smtpPassword, setSmtpPassword] = useState('')

  function save(section: string) {
    toast.success(`${section}已保存（演示，不会真正落库）`)
  }

  return (
    <>
      <PageHeader
        title="系统设置"
        description="站点信息、注册策略、支付渠道、邮件与角色权限"
        actions={
          <Button variant="outline" onClick={() => save('全部设置')}>
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
                    setRegistration({ ...registration, giftTrafficGb: Number(event.target.value) || 0 })
                  }
                />
                <FieldDescription>新用户注册后自动到账的体验流量，填 0 表示不赠送。</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  id="registration-invite"
                  checked={registration.inviteOnly}
                  onCheckedChange={(checked) => setRegistration({ ...registration, inviteOnly: checked })}
                />
                <FieldContent>
                  <FieldLabel htmlFor="registration-invite">仅邀请码注册</FieldLabel>
                  <FieldDescription>开启后注册必须填写有效邀请码。</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
        </TabsContent>

        <TabsContent value="payment" className="pt-4">
          <div className="grid max-w-3xl gap-4">
            {channels.map((channel) => (
              <Card key={channel.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard data-icon="inline-start" className="size-4 text-muted-foreground" />
                      <CardTitle className="text-base">{channel.name}</CardTitle>
                      <Badge variant={channel.mode === '生产' ? 'success' : 'outline'}>{channel.mode}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {channel.enabled ? '已启用' : '已停用'}
                      </span>
                      <Switch
                        checked={channel.enabled}
                        aria-label={`${channel.name} 启用开关`}
                        onCheckedChange={(checked) =>
                          setChannels((current) =>
                            current.map((item) =>
                              item.id === channel.id ? { ...item, enabled: checked } : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <CardDescription>{channel.summary}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end justify-between gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {channel.fields.map((field) => (
                      <div key={field.label} className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">{field.label}</span>
                        <span className="font-mono text-xs break-all">{field.value}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toast.success(`打开 ${channel.name} 配置`)}>
                    配置
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="email" className="pt-4">
          <div className="max-w-2xl">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="smtp-host">SMTP 主机</FieldLabel>
                  <Input
                    id="smtp-host"
                    value={email.host}
                    onChange={(event) => setEmail({ ...email, host: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="smtp-port">端口</FieldLabel>
                  <Input
                    id="smtp-port"
                    inputMode="numeric"
                    value={email.port}
                    onChange={(event) => setEmail({ ...email, port: event.target.value })}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="smtp-username">用户名</FieldLabel>
                <Input
                  id="smtp-username"
                  value={email.username}
                  onChange={(event) => setEmail({ ...email, username: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-password">密码</FieldLabel>
                <Input
                  id="smtp-password"
                  type="password"
                  value={smtpPassword}
                  onChange={(event) => setSmtpPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <FieldDescription>留空表示保持原密码；密钥在服务端加密存储，接口不回显。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-from">发件人</FieldLabel>
                <Input
                  id="smtp-from"
                  value={email.from}
                  onChange={(event) => setEmail({ ...email, from: event.target.value })}
                />
              </Field>
              <Field orientation="horizontal">
                <Switch
                  id="smtp-secure"
                  checked={email.secure}
                  onCheckedChange={(checked) => setEmail({ ...email, secure: checked })}
                />
                <FieldContent>
                  <FieldLabel htmlFor="smtp-secure">启用 TLS</FieldLabel>
                  <FieldDescription>465 端口通常需要开启，587 使用 STARTTLS。</FieldDescription>
                </FieldContent>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save('邮件设置')}>
                  <Save data-icon="inline-start" />
                  保存
                </Button>
                <Button variant="outline" onClick={() => toast.success('测试邮件已发送，请检查收件箱')}>
                  <Send data-icon="inline-start" />
                  发送测试邮件
                </Button>
              </div>
            </FieldGroup>
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
        <Button onClick={() => save('系统设置')}>
          <Save data-icon="inline-start" />
          保存
        </Button>
      </div>
    </>
  )
}
