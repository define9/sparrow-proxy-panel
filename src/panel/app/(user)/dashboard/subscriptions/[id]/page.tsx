'use client'

import type { Subscription } from '@sparrow/contracts'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  Globe2,
  Laptop,
  Link2,
  MonitorSmartphone,
  Rss,
  Smartphone
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { CopyButton } from '@/components/common/copy-button'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { QuotaBar } from '@/components/common/quota-bar'
import { StateBadge } from '@/components/common/state-badge'
import { InfoItem, InfoList } from '@/components/user/info-list'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes, formatDate, formatDay, percent } from '@/lib/format'
import { subscriptions } from '@/lib/mock/catalog'
import {
  SUBSCRIPTION_FORMATS,
  demoDaysLeft,
  devices,
  nodeGroupSummaries,
  subscriptionUrl,
  type SubscriptionFormat
} from '@/lib/mock/user-data'

export default function SubscriptionDetailPage() {
  const params = useParams<{ id: string }>()
  const subscription = subscriptions.find((item) => item.id === params.id)

  if (!subscription) {
    return (
      <EmptyState
        icon={Rss}
        title="订阅不存在"
        description="该订阅可能已被删除，请返回订阅列表重新选择。"
        action={
          <Button asChild>
            <Link href="/dashboard/subscriptions">返回订阅列表</Link>
          </Button>
        }
      />
    )
  }

  return <SubscriptionDetail key={subscription.id} subscription={subscription} />
}

function SubscriptionDetail({ subscription }: { subscription: Subscription }) {
  const [format, setFormat] = useState<SubscriptionFormat>(subscription.format)

  const currentUrl = subscriptionUrl(subscription.token, subscription.format)
  const days = demoDaysLeft(subscription.expireAt)
  const usage = percent(subscription.trafficUsed, subscription.trafficLimit)
  const activeDevices = devices.length

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/subscriptions">订阅</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{subscription.id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={subscription.planName}
        description={`订阅 ${subscription.id} · 创建于 ${formatDate(subscription.createdAt)}`}
        actions={
          <>
            <StateBadge status={subscription.status} />
            <CopyButton value={currentUrl} label="复制订阅链接" />
            <Button asChild variant="outline">
              <Link href="/dashboard/subscriptions">
                <ArrowLeft data-icon aria-hidden="true" />
                返回列表
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>订阅链接</CardTitle>
              <CardDescription>
                三种格式指向同一份配置，按客户端类型选择后复制即可
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={format}
                onValueChange={(value) => setFormat(value as SubscriptionFormat)}
              >
                <TabsList>
                  {SUBSCRIPTION_FORMATS.map((item) => (
                    <TabsTrigger key={item.value} value={item.value}>
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {SUBSCRIPTION_FORMATS.map((item) => {
                  const url = subscriptionUrl(subscription.token, item.value)
                  return (
                    <TabsContent key={item.value} value={item.value} className="pt-4">
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor={`sub-link-${item.value}`}>
                            <Link2
                              className="size-3.5 text-muted-foreground"
                              data-icon
                              aria-hidden="true"
                            />
                            {item.label} 订阅地址
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Input
                              id={`sub-link-${item.value}`}
                              readOnly
                              value={url}
                              className="font-mono text-xs"
                              onFocus={(event) => event.currentTarget.select()}
                            />
                            <CopyButton value={url} className="shrink-0" />
                          </div>
                          <FieldDescription>适用于 {item.hint}</FieldDescription>
                        </Field>
                      </FieldGroup>
                    </TabsContent>
                  )
                })}
              </Tabs>

              <p className="mt-4 text-xs text-muted-foreground">
                订阅链接包含访问凭证，请勿分享给他人；泄露后可在订阅列表重新生成。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle>流量配额</CardTitle>
                  <CardDescription>流量用尽后自动暂停，不会产生额外扣费</CardDescription>
                </div>
                <Badge variant={usage >= 80 ? 'warning' : 'outline'}>{usage}% 已用</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <QuotaBar used={subscription.trafficUsed} limit={subscription.trafficLimit} />
              <InfoList>
                <InfoItem label="已用流量" mono>
                  {formatBytes(subscription.trafficUsed, 2)}
                </InfoItem>
                <InfoItem label="剩余流量" mono>
                  {formatBytes(subscription.trafficLimit - subscription.trafficUsed, 2)}
                </InfoItem>
                <InfoItem label="下载" mono>
                  {formatBytes(subscription.download, 2)}
                </InfoItem>
                <InfoItem label="上传" mono>
                  {formatBytes(subscription.upload, 2)}
                </InfoItem>
              </InfoList>
              {usage >= 80 ? (
                <Alert>
                  <CalendarClock data-icon aria-hidden="true" />
                  <AlertTitle>流量即将用尽</AlertTitle>
                  <AlertDescription>
                    已使用 {usage}%，用尽后订阅会自动暂停。可前往商品页购买流量包继续使用。
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>套餐与到期</CardTitle>
              <CardDescription>续费后到期时间顺延</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoList className="grid-cols-1 sm:grid-cols-1">
                <InfoItem label="套餐">
                  <Link
                    href={`/dashboard/plans/${subscription.planId}`}
                    className="text-primary hover:underline"
                  >
                    {subscription.planName}
                  </Link>
                </InfoItem>
                <InfoItem label="订阅状态">
                  <StateBadge status={subscription.status} />
                </InfoItem>
                <InfoItem label="到期时间" mono>
                  {formatDay(subscription.expireAt)}
                </InfoItem>
                <InfoItem label="剩余天数" mono>
                  <span
                    className={cn(
                      days < 0 ? 'text-destructive' : days <= 7 ? 'text-warning' : undefined
                    )}
                  >
                    {days < 0 ? `已过期 ${Math.abs(days)} 天` : `${days} 天`}
                  </span>
                </InfoItem>
                <InfoItem label="限速" mono>
                  {subscription.speedLimitMbps > 0
                    ? `${subscription.speedLimitMbps} Mbps`
                    : '不限速'}
                </InfoItem>
              </InfoList>
              <Button
                className="mt-4 w-full"
                variant="outline"
                onClick={() => toast.info('演示环境：续费接口未接入')}
              >
                续费这个套餐
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone
                    className="size-4 text-muted-foreground"
                    data-icon
                    aria-hidden="true"
                  />
                  <CardTitle>在线设备</CardTitle>
                </div>
                <Badge variant="outline">
                  {activeDevices} / {subscription.deviceLimit}
                </Badge>
              </div>
              <CardDescription>同时在线设备数达到上限后新设备无法连接</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-3">
                {devices.map((device) => {
                  const DeviceIcon = device.platform.startsWith('iOS') ? Smartphone : Laptop
                  return (
                    <li key={device.id} className="flex items-start gap-2">
                      <DeviceIcon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        data-icon
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm">
                          {device.name}
                          {device.current ? <Badge variant="success">当前设备</Badge> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{device.client}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {device.ip}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <Separator />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => toast.info('演示环境：设备管理接口未接入')}
              >
                管理设备
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe2 className="size-4 text-muted-foreground" data-icon aria-hidden="true" />
                <CardTitle>可用节点组</CardTitle>
              </div>
              <CardDescription>订阅会自动包含以下线路</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {nodeGroupSummaries.map((group) => (
                  <li key={group.id} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {group.region} · {group.name}
                      </span>
                      <Badge variant={group.onlineCount > 0 ? 'success' : 'secondary'}>
                        {group.onlineCount} / {group.nodeCount} 在线
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{group.remark}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {group.protocols.join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
