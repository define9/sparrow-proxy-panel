'use client'

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AdminNodeGroup } from '@/lib/api/nodes'

export interface NodeGroupFormValues {
  name: string
  region: string
  remark: string
  sort: number
}

interface GroupEditDialogProps {
  /** null 表示新建 */
  group: AdminNodeGroup | null
  open: boolean
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (id: string | null, values: NodeGroupFormValues) => void
}

export function GroupEditDialog({
  group,
  open,
  pending = false,
  onOpenChange,
  onSubmit
}: GroupEditDialogProps) {
  // 用 key 强制重挂载来重置表单，避免在 effect 里同步 setState
  const [name, setName] = useState(() => group?.name ?? '')
  const [region, setRegion] = useState(() => group?.region ?? '')
  const [sort, setSort] = useState(() => String(group?.sort ?? 0))
  const [remark, setRemark] = useState(() => group?.remark ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: Record<string, string> = {}
    const sortNumber = Number(sort)
    if (!name.trim()) next.name = '请填写节点组名称'
    if (!region.trim()) next.region = '请填写所属区域'
    if (!Number.isInteger(sortNumber) || sortNumber < 0) next.sort = '排序需为非负整数'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit(group?.id ?? null, {
      name: name.trim(),
      region: region.trim(),
      remark: remark.trim(),
      sort: sortNumber
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? '编辑节点组' : '新建节点组'}</DialogTitle>
          <DialogDescription>
            节点组用于聚合线路与调度策略，修改后立即生效。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="group-name">名称</FieldLabel>
                <Input
                  id="group-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                />
                <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
              </Field>
              <Field data-invalid={Boolean(errors.region)}>
                <FieldLabel htmlFor="group-region">区域</FieldLabel>
                <Input
                  id="group-region"
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  aria-invalid={Boolean(errors.region)}
                />
                <FieldError errors={errors.region ? [{ message: errors.region }] : undefined} />
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.sort)}>
              <FieldLabel htmlFor="group-sort">排序</FieldLabel>
              <Input
                id="group-sort"
                inputMode="numeric"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-invalid={Boolean(errors.sort)}
              />
              <FieldError errors={errors.sort ? [{ message: errors.sort }] : undefined} />
            </Field>

            <Field>
              <FieldLabel htmlFor="group-remark">备注</FieldLabel>
              <Textarea
                id="group-remark"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="线路说明、调度策略等"
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
