'use client'

import { AlertTriangle, Save } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/empty-state'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/common/state-badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/format'
import { usePluginDetail, type PluginType } from '@/lib/api/admin'

const pluginTypeLabels: Record<PluginType, string> = {
  payment: '支付',
  node_source: '节点源',
  subscription: '订阅',
  notify: '通知',
  hook: '钩子',
  ui: '界面'
}

const jobStatusMeta = {
  success: { variant: 'success', label: '成功' },
  failed: { variant: 'destructive', label: '失败' },
  skipped: { variant: 'outline', label: '跳过' }
} as const

const eventLevelMeta = {
  info: { variant: 'info', label: 'INFO' },
  warn: { variant: 'warning', label: 'WARN' },
  error: { variant: 'destructive', label: 'ERROR' }
} as const

interface PluginSheetProps {
  pluginKey: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PluginSheet({ pluginKey, open, onOpenChange }: PluginSheetProps) {
  if (!pluginKey) return null
  return <PluginSheetBody key={pluginKey} pluginKey={pluginKey} open={open} onOpenChange={onOpenChange} />
}

function PluginSheetBody({ pluginKey, open, onOpenChange }: Omit<PluginSheetProps, 'pluginKey'> & { pluginKey: string }) {
  const { data: plugin, isLoading, isError, error } = usePluginDetail(open ? pluginKey : null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {plugin?.name ?? pluginKey}
            <Badge variant="outline" className="font-mono">
              {pluginKey}
            </Badge>
            {plugin ? (
              <>
                <StateBadge status={plugin.status} />
                <StateBadge status={plugin.health} />
              </>
            ) : null}
          </SheetTitle>
          <SheetDescription>{plugin?.description || '插件详情'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : isError ? (
            <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
          ) : !plugin ? null : (
            <Tabs defaultValue="overview">
              <TabsList className="w-full">
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="config">配置表单</TabsTrigger>
                <TabsTrigger value="jobs">定时任务</TabsTrigger>
                <TabsTrigger value="events">事件日志</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="pt-4">
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>来源仓库</FieldLabel>
                    <p className="font-mono text-xs break-all">
                      {plugin.repoUrl.replace(/^https?:\/\/github\.com\//, '')}@{plugin.commitSha.slice(0, 7)}
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel>commit sha</FieldLabel>
                    <p className="font-mono text-xs break-all">{plugin.commitSha}</p>
                  </Field>
                  <Field>
                    <FieldLabel>版本</FieldLabel>
                    <p className="font-mono text-sm">{plugin.version}</p>
                  </Field>
                  <Field>
                    <FieldLabel>类型</FieldLabel>
                    <p className="text-sm">{pluginTypeLabels[plugin.type]}</p>
                  </Field>
                  <Field>
                    <FieldLabel>作者</FieldLabel>
                    <p className="text-sm">{plugin.author || '—'}</p>
                  </Field>
                  <Field>
                    <FieldLabel>安装时间</FieldLabel>
                    <p className="text-sm">{formatDate(plugin.installedAt)}</p>
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel>签名</FieldLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      {plugin.signed ? (
                        <Badge variant="success">签名已验证</Badge>
                      ) : (
                        <Badge variant="warning">未签名社区插件</Badge>
                      )}
                      <Badge variant="outline">兼容 {plugin.compatibility || '未声明'}</Badge>
                    </div>
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel>权限</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {plugin.permissions.length === 0 ? (
                        <span className="text-sm text-muted-foreground">未申请权限</span>
                      ) : (
                        plugin.permissions.map((permission) => (
                          <Badge key={permission} variant="secondary" className="font-mono">
                            {permission}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel>出网域名</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {plugin.egress.length === 0 ? (
                        <span className="text-sm text-muted-foreground">无（不访问外部网络）</span>
                      ) : (
                        plugin.egress.map((host) => (
                          <Badge key={host} variant="outline" className="font-mono">
                            {host}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel>Hook</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {plugin.hooks.length === 0 ? (
                        <span className="text-sm text-muted-foreground">未订阅任何 Hook</span>
                      ) : (
                        plugin.hooks.map((hook) => (
                          <Badge key={hook} variant="secondary" className="font-mono">
                            {hook}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Field>
                </FieldGroup>

                {plugin.lastError ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle data-icon="inline-start" />
                    <AlertTitle>最近错误</AlertTitle>
                    <AlertDescription>{plugin.lastError}</AlertDescription>
                  </Alert>
                ) : null}
              </TabsContent>

              <TabsContent value="config" className="pt-4">
                <FieldGroup>
                  {plugin.config.length === 0 ? (
                    <EmptyState title="没有配置项" description="该插件未声明 config schema" />
                  ) : (
                    plugin.config.map((field) => (
                      <Field key={field.key}>
                        <FieldLabel htmlFor={`${plugin.id}-${field.key}`}>{field.label}</FieldLabel>
                        {field.type === 'switch' ? (
                          <div className="flex items-center gap-2">
                            <Switch id={`${plugin.id}-${field.key}`} defaultChecked={field.value === 'true'} disabled />
                            <span className="text-sm text-muted-foreground">
                              {field.value === 'true' ? '已开启' : '已关闭'}
                            </span>
                          </div>
                        ) : (
                          <Input
                            id={`${plugin.id}-${field.key}`}
                            type={field.type === 'password' ? 'password' : 'text'}
                            inputMode={field.type === 'number' ? 'decimal' : undefined}
                            defaultValue={field.value}
                            disabled
                          />
                        )}
                      </Field>
                    ))
                  )}
                  <div className="flex flex-col gap-2">
                    <Button disabled>
                      <Save data-icon="inline-start" />
                      保存配置
                    </Button>
                    <FieldDescription>插件配置写入接口尚未实现，当前仅展示已存配置。</FieldDescription>
                  </div>
                </FieldGroup>
              </TabsContent>

              <TabsContent value="jobs" className="pt-4">
                {plugin.jobs.length === 0 ? (
                  <EmptyState title="没有定时任务" description="该插件的 manifest 未声明 schedules" />
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Key</TableHead>
                          <TableHead>Cron</TableHead>
                          <TableHead>下次执行</TableHead>
                          <TableHead>最近状态</TableHead>
                          <TableHead>最近运行</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plugin.jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-mono text-xs">{job.key}</TableCell>
                            <TableCell className="font-mono text-xs">{job.cron}</TableCell>
                            <TableCell className="text-xs">{formatDate(job.nextRunAt)}</TableCell>
                            <TableCell>
                              <Badge variant={jobStatusMeta[job.lastStatus].variant}>
                                {jobStatusMeta[job.lastStatus].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{formatDate(job.lastRunAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="events" className="pt-4">
                {plugin.events.length === 0 ? (
                  <EmptyState title="暂无事件" description="插件运行后再回来看" />
                ) : (
                  <ol className="flex flex-col gap-3">
                    {plugin.events.map((event) => (
                      <li key={event.id} className="flex flex-col gap-1 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={eventLevelMeta[event.level].variant}>
                            {eventLevelMeta[event.level].label}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">{formatDate(event.at)}</span>
                        </div>
                        <p className="text-sm">{event.message}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
