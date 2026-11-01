'use client'

import { useState } from 'react'
import { Gauge, HardDrive, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export type BulkAction = 'extend' | 'quota' | 'speed'

interface BulkActionConfig {
  title: string
  description: string
  label: string
  unit: string
  placeholder: string
  defaultValue: string
  helper?: string
}

const CONFIG: Record<BulkAction, BulkActionConfig> = {
  extend: {
    title: '延长订阅有效期',
    description: '为选中的订阅统一延长天数，按当前到期时间顺延。',
    label: '延长天数',
    unit: '天',
    placeholder: '30',
    defaultValue: '30'
  },
  quota: {
    title: '调整订阅配额',
    description: '批量覆盖选中订阅的流量总额度，已用量保持不变。',
    label: '流量额度',
    unit: 'GB',
    placeholder: '200',
    defaultValue: '200'
  },
  speed: {
    title: '调整限速',
    description: '批量设置峰值速度，填 0 表示不限速。',
    label: '速度上限',
    unit: 'Mbps',
    placeholder: '300',
    defaultValue: '300',
    helper: '填 0 表示不限速。'
  }
}

const ICONS: Record<BulkAction, typeof Timer> = {
  extend: Timer,
  quota: HardDrive,
  speed: Gauge
}

interface SubscriptionBulkDialogProps {
  action: BulkAction
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (action: BulkAction, value: number) => void
}

export function SubscriptionBulkDialog({
  action,
  count,
  open,
  onOpenChange,
  onConfirm
}: SubscriptionBulkDialogProps) {
  const config = CONFIG[action]
  const Icon = ICONS[action]
  const [value, setValue] = useState(config.defaultValue)
  const [error, setError] = useState<string | undefined>(undefined)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Number(value)

    if (!value.trim() || Number.isNaN(parsed) || !Number.isInteger(parsed)) {
      setError('请填写整数')
      return
    }
    if (action === 'extend' && parsed <= 0) {
      setError('延长天数必须大于 0')
      return
    }
    if (parsed < 0) {
      setError('数值不能为负数')
      return
    }

    onConfirm(action, parsed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon data-icon="inline-start" className="size-4 text-muted-foreground" />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            已选择 <span className="font-mono tabular-nums text-foreground">{count}</span> 个订阅。
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`bulk-${action}`}>
                {config.label}（{config.unit}）
              </FieldLabel>
              <Input
                id={`bulk-${action}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={value}
                placeholder={config.placeholder}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError(undefined)
                }}
                className="font-mono tabular-nums"
                aria-invalid={Boolean(error)}
              />
              {config.helper ? <FieldDescription>{config.helper}</FieldDescription> : null}
              <FieldError errors={[{ message: error }]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">确认调整</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
