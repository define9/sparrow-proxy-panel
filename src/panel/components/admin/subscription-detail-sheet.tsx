'use client'

import { useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CalendarPlus, Pause, Play, Save } from 'lucide-react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/common/copy-button'
import { QuotaBar } from '@/components/common/quota-bar'
import { StateBadge } from '@/components/common/state-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import {
  useUpdateAdminSubscription,
  type AdminSubscriptionRow
} from '@/lib/api/admin-commerce'
import { subscriptionFormatLabels, subscriptionLink } from '@/lib/admin-labels'
import { daysLeft, formatBytes, formatDate } from '@/lib/format'

const GB = 1024 ** 3

interface SubscriptionDetailSheetProps {
  subscription: AdminSubscriptionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onExtend: (subscription: AdminSubscriptionRow) => void
  onTogglePause: (subscription: AdminSubscriptionRow) => void
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function SubscriptionDetailSheet({
  subscription,
  open,
  onOpenChange,
  onExtend,
  onTogglePause
}: SubscriptionDetailSheetProps) {
  const update = useUpdateAdminSubscription()
  const [quotaGb, setQuotaGb] = useState(() =>
    subscription ? String(Math.round((subscription.trafficLimit / GB) * 100) / 100) : ''
  )
  const [devices, setDevices] = useState(() => (subscription ? String(subscription.deviceLimit) : ''))
  const [speed, setSpeed] = useState(() =>
    subscription ? String(subscription.speedLimitMbps) : ''
  )

  if (!subscription) return null

  const remaining = daysLeft(subscription.expireAt)
  const paused = subscription.status === 'paused'
  const current = subscription

  function handleSave() {
    const quota = Number(quotaGb)
    const deviceLimit = Number(devices)
    const speedLimit = Number(speed)

    if (Number.isNaN(quota) || quota < 0) {
      toast.error('流量额度必须是不小于 0 的数字')
      return
    }
    if (!Number.isInteger(deviceLimit) || deviceLimit < 0) {
      toast.error('设备数必须是不小于 0 的整数')
      return
    }
    if (!Number.isInteger(speedLimit) || speedLimit < 0) {
      toast.error('限速必须是不小于 0 的整数')
      return
    }

    update.mutate(
      {
        id: current.id,
        trafficLimit: Math.round(quota * GB),
        deviceLimit,
        speedLimitMbps: speedLimit
      },
      {
        onSuccess: () => toast.success('订阅限制已保存'),
        onError: (error) => toast.error(error.message)
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            订阅详情
            <StateBadge status={subscription.status} />
          </SheetTitle>
          <SheetDescription>
            {subscription.userEmail} · {subscription.planName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">流量使用</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <QuotaBar used={subscription.trafficUsed} limit={subscription.trafficLimit} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ArrowUpFromLine data-icon="inline-start" className="size-3.5" />
                    上传
                  </span>
                  <span className="font-mono tabular-nums">{formatBytes(subscription.upload)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ArrowDownToLine data-icon="inline-start" className="size-3.5" />
                    下载
                  </span>
                  <span className="font-mono tabular-nums">{formatBytes(subscription.download)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="subscription-link">订阅链接</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="subscription-link"
                  readOnly
                  value={subscriptionLink(subscription.token)}
                  className="font-mono text-xs"
                />
                <CopyButton value={subscriptionLink(subscription.token)} label="复制链接" />
              </div>
            </Field>
          </FieldGroup>

          <Separator />

          <dl className="grid grid-cols-2 gap-4">
            <InfoRow label="用户">
              <span className="font-mono text-xs">{subscription.userEmail}</span>
            </InfoRow>
            <InfoRow label="套餐">{subscription.planName}</InfoRow>
            <InfoRow label="客户端格式">{subscriptionFormatLabels[subscription.format]}</InfoRow>
            <InfoRow label="设备上限">
              <span className="font-mono tabular-nums">{subscription.deviceLimit} 台</span>
            </InfoRow>
            <InfoRow label="速度限制">
              <span className="font-mono tabular-nums">
                {subscription.speedLimitMbps > 0 ? `${subscription.speedLimitMbps} Mbps` : '不限速'}
              </span>
            </InfoRow>
            <InfoRow label="创建时间">{formatDate(subscription.createdAt)}</InfoRow>
            <InfoRow label="到期时间">{formatDate(subscription.expireAt)}</InfoRow>
            <InfoRow label="剩余天数">
              <span
                className={
                  remaining <= 0
                    ? 'font-mono text-destructive tabular-nums'
                    : remaining <= 7
                      ? 'font-mono text-warning tabular-nums'
                      : 'font-mono tabular-nums'
                }
              >
                {remaining <= 0 ? '已过期' : `${remaining} 天`}
              </span>
            </InfoRow>
          </dl>

          <Separator />

          <FieldGroup>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">配额与限制</h3>
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={handleSave}>
                {update.isPending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                保存
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="subscription-quota">流量（GB）</FieldLabel>
                <Input
                  id="subscription-quota"
                  type="number"
                  min={0}
                  value={quotaGb}
                  onChange={(event) => setQuotaGb(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-devices">设备数</FieldLabel>
                <Input
                  id="subscription-devices"
                  type="number"
                  min={0}
                  value={devices}
                  onChange={(event) => setDevices(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-speed">限速</FieldLabel>
                <Input
                  id="subscription-speed"
                  type="number"
                  min={0}
                  value={speed}
                  onChange={(event) => setSpeed(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
            </div>
          </FieldGroup>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onExtend(subscription)
              toast.success(`已为 ${subscription.userEmail} 延长 30 天`)
            }}
          >
            <CalendarPlus data-icon="inline-start" />
            延长 30 天
          </Button>
          <Button
            variant={paused ? 'default' : 'destructive'}
            size="sm"
            onClick={() => {
              onTogglePause(subscription)
              toast.success(paused ? '订阅已恢复' : '订阅已暂停')
            }}
          >
            {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {paused ? '恢复订阅' : '暂停订阅'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
