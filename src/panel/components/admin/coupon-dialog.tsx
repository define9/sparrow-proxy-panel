'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CouponType } from '@/lib/mock/admin-ops'

export interface NewCouponInput {
  code: string
  type: CouponType
  value: number
  total: number
  minAmount: string
  expiresAt: string
}

interface CouponDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: NewCouponInput) => void
}

export function CouponDialog({ open, onOpenChange, onSubmit }: CouponDialogProps) {
  const [code, setCode] = useState('')
  const [type, setType] = useState<CouponType>('fixed')
  const [value, setValue] = useState('10')
  const [total, setTotal] = useState('100')
  const [minAmount, setMinAmount] = useState('0.00')
  const [expiresAt, setExpiresAt] = useState('')

  function reset() {
    setCode('')
    setType('fixed')
    setValue('10')
    setTotal('100')
    setMinAmount('0.00')
    setExpiresAt('')
  }

  const invalidValue = !Number.isFinite(Number(value)) || Number(value) <= 0
  const invalidCode = Boolean(code) && !/^[A-Z0-9-]{3,24}$/.test(code)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建优惠券</DialogTitle>
          <DialogDescription>优惠券码全站唯一，创建后可在订单结算时抵扣。</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={invalidCode}>
            <FieldLabel htmlFor="coupon-code">优惠券码</FieldLabel>
            <Input
              id="coupon-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="如：WELCOME10"
              className="font-mono"
              aria-invalid={invalidCode}
            />
            {invalidCode ? <FieldDescription>3-24 位大写字母、数字或连字符</FieldDescription> : null}
          </Field>

          <Field>
            <FieldLabel>类型</FieldLabel>
            <Select value={type} onValueChange={(next) => setType(next as CouponType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">固定金额</SelectItem>
                <SelectItem value="percent">百分比折扣</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={invalidValue}>
            <FieldLabel htmlFor="coupon-value">{type === 'fixed' ? '面值（元）' : '折扣（%）'}</FieldLabel>
            <Input
              id="coupon-value"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={invalidValue}
            />
            <FieldDescription>
              {type === 'fixed' ? '结算时直接抵扣对应金额' : '如 20 表示减免 20%，最多减至 0 元'}
            </FieldDescription>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="coupon-total">数量</FieldLabel>
              <Input
                id="coupon-total"
                inputMode="numeric"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="coupon-min">最低消费（元）</FieldLabel>
              <Input
                id="coupon-min"
                inputMode="decimal"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="coupon-expires">到期日</FieldLabel>
            <Input
              id="coupon-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!code.trim() || invalidCode || invalidValue || !expiresAt}
            onClick={() => {
              onSubmit({
                code: code.trim(),
                type,
                value: Number(value),
                total: Number(total) || 0,
                minAmount: Number(minAmount || 0).toFixed(2),
                expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString()
              })
              toast.success(`已创建优惠券 ${code.trim()}`)
              reset()
              onOpenChange(false)
            }}
          >
            <Plus data-icon="inline-start" />
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
