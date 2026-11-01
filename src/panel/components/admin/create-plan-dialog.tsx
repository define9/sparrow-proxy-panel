'use client'

import { useState } from 'react'
import type { Plan } from '@sparrow/contracts'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface PlanFormValues {
  name: string
  slug: string
  price: string
  trafficGb: string
  durationDays: string
  deviceLimit: string
  stock: string
}

const EMPTY_FORM: PlanFormValues = {
  name: '',
  slug: '',
  price: '30.00',
  trafficGb: '200',
  durationDays: '30',
  deviceLimit: '3',
  stock: ''
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validate(values: PlanFormValues) {
  const errors: Partial<Record<keyof PlanFormValues, string>> = {}

  if (!values.name.trim()) errors.name = '请填写商品名称'
  if (!values.slug.trim()) {
    errors.slug = '请填写 slug'
  } else if (!SLUG_PATTERN.test(values.slug.trim())) {
    errors.slug = 'slug 只能包含小写字母、数字与连字符'
  }

  const price = Number(values.price)
  if (!values.price.trim() || Number.isNaN(price) || price < 0) errors.price = '价格必须是不小于 0 的数字'

  const trafficGb = Number(values.trafficGb)
  if (Number.isNaN(trafficGb) || trafficGb < 0) errors.trafficGb = '流量不能为负数'

  const durationDays = Number(values.durationDays)
  if (!Number.isInteger(durationDays) || durationDays <= 0) errors.durationDays = '时长必须是大于 0 的整数'

  const deviceLimit = Number(values.deviceLimit)
  if (!Number.isInteger(deviceLimit) || deviceLimit < 0) errors.deviceLimit = '设备数必须是不小于 0 的整数'

  if (values.stock.trim()) {
    const stock = Number(values.stock)
    if (!Number.isInteger(stock) || stock < 0) errors.stock = '库存必须是不小于 0 的整数，留空表示不限'
  }

  return errors
}

interface CreatePlanDialogProps {
  onCreated: (plan: Plan) => void
}

export function CreatePlanDialog({ onCreated }: CreatePlanDialogProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<PlanFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof PlanFormValues, string>>>({})

  function update<K extends keyof PlanFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setValues(EMPTY_FORM)
      setErrors({})
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(values)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const plan: Plan = {
      id: `plan_${Date.now()}`,
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: '',
      type: 'traffic',
      price: Number(values.price).toFixed(2),
      originalPrice: null,
      trafficGb: Number(values.trafficGb),
      durationDays: Number(values.durationDays),
      deviceLimit: Number(values.deviceLimit),
      speedLimitMbps: 0,
      stock: values.stock.trim() ? Number(values.stock) : null,
      soldCount: 0,
      status: 'draft',
      isHot: false,
      tags: [],
      sort: 99
    }

    onCreated(plan)
    toast.success(`商品「${plan.name}」已创建（演示数据）`)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          新建商品
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建商品</DialogTitle>
          <DialogDescription>填写基础信息后保存为草稿，可在列表中上架。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="plan-name">商品名称</FieldLabel>
              <Input
                id="plan-name"
                value={values.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="例如：标准月付"
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError errors={[{ message: errors.name }]} />
            </Field>

            <Field data-invalid={Boolean(errors.slug)}>
              <FieldLabel htmlFor="plan-slug">slug</FieldLabel>
              <Input
                id="plan-slug"
                value={values.slug}
                onChange={(event) => update('slug', event.target.value)}
                placeholder="standard-monthly"
                className="font-mono"
                aria-invalid={Boolean(errors.slug)}
              />
              <FieldDescription>用于订阅链接与接口标识，全站唯一。</FieldDescription>
              <FieldError errors={[{ message: errors.slug }]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.price)}>
                <FieldLabel htmlFor="plan-price">价格（元）</FieldLabel>
                <Input
                  id="plan-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.price}
                  onChange={(event) => update('price', event.target.value)}
                  className="font-mono tabular-nums"
                  aria-invalid={Boolean(errors.price)}
                />
                <FieldError errors={[{ message: errors.price }]} />
              </Field>

              <Field data-invalid={Boolean(errors.trafficGb)}>
                <FieldLabel htmlFor="plan-traffic">流量（GB）</FieldLabel>
                <Input
                  id="plan-traffic"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={values.trafficGb}
                  onChange={(event) => update('trafficGb', event.target.value)}
                  className="font-mono tabular-nums"
                  aria-invalid={Boolean(errors.trafficGb)}
                />
                <FieldDescription>填 0 表示不限量。</FieldDescription>
                <FieldError errors={[{ message: errors.trafficGb }]} />
              </Field>

              <Field data-invalid={Boolean(errors.durationDays)}>
                <FieldLabel htmlFor="plan-duration">时长（天）</FieldLabel>
                <Input
                  id="plan-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={values.durationDays}
                  onChange={(event) => update('durationDays', event.target.value)}
                  className="font-mono tabular-nums"
                  aria-invalid={Boolean(errors.durationDays)}
                />
                <FieldError errors={[{ message: errors.durationDays }]} />
              </Field>

              <Field data-invalid={Boolean(errors.deviceLimit)}>
                <FieldLabel htmlFor="plan-devices">设备数</FieldLabel>
                <Input
                  id="plan-devices"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={values.deviceLimit}
                  onChange={(event) => update('deviceLimit', event.target.value)}
                  className="font-mono tabular-nums"
                  aria-invalid={Boolean(errors.deviceLimit)}
                />
                <FieldError errors={[{ message: errors.deviceLimit }]} />
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.stock)}>
              <FieldLabel htmlFor="plan-stock">库存</FieldLabel>
              <Input
                id="plan-stock"
                type="number"
                inputMode="numeric"
                min={0}
                value={values.stock}
                onChange={(event) => update('stock', event.target.value)}
                placeholder="留空表示不限库存"
                className="font-mono tabular-nums"
                aria-invalid={Boolean(errors.stock)}
              />
              <FieldError errors={[{ message: errors.stock }]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">保存商品</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
