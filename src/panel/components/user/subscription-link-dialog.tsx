'use client'

import type { Subscription } from '@sparrow/contracts'
import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { CopyButton } from '@/components/common/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SUBSCRIPTION_FORMATS,
  subscriptionUrl,
  type SubscriptionFormat
} from '@/lib/billing'
import { QrPreview } from '@/components/user/qr-preview'

function LinkBody({ subscription }: { subscription: Subscription }) {
  const [format, setFormat] = useState<SubscriptionFormat>(subscription.format)

  return (
    <div className="flex flex-col gap-4">
      <QrPreview
        value={subscriptionUrl(subscription.token, format)}
        className="mx-auto max-w-48"
      />

      <Tabs value={format} onValueChange={(value) => setFormat(value as SubscriptionFormat)}>
        <TabsList className="w-full">
          {SUBSCRIPTION_FORMATS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SUBSCRIPTION_FORMATS.map((item) => {
          const url = subscriptionUrl(subscription.token, item.value)
          return (
            <TabsContent key={item.value} value={item.value} className="pt-3">
              <FieldGroup className="gap-2">
                <Field>
                  <FieldLabel htmlFor={`sub-dialog-link-${item.value}`}>
                    <Link2 className="size-3.5 text-muted-foreground" data-icon aria-hidden="true" />
                    {item.label} 订阅地址
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`sub-dialog-link-${item.value}`}
                      readOnly
                      value={url}
                      className="font-mono text-xs"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <CopyButton value={url} className="shrink-0" />
                  </div>
                  <FieldDescription>{item.hint}</FieldDescription>
                </Field>
              </FieldGroup>
            </TabsContent>
          )
        })}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        订阅链接包含访问凭证，请勿分享给他人；泄露后请联系管理员重置。
      </p>
    </div>
  )
}

export function SubscriptionLinkDialog({
  subscription,
  open,
  onOpenChange
}: {
  subscription: Subscription | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {subscription ? (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>订阅链接</DialogTitle>
            <DialogDescription>
              {subscription.planName} · 支持三种客户端格式，切换后重新复制即可
            </DialogDescription>
          </DialogHeader>
          <LinkBody key={subscription.id} subscription={subscription} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
