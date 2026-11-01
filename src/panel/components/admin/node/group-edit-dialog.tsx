'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { NodeGroupStat } from '@/lib/mock/admin-nodes'

export interface NodeGroupPatch {
  name: string
  region: string
  remark: string
  avgLatency: number
}

interface GroupEditDialogProps {
  group: NodeGroupStat | null
  onOpenChange: (open: boolean) => void
  onSave: (id: string, patch: NodeGroupPatch) => void
}

export function GroupEditDialog({ group, onOpenChange, onSave }: GroupEditDialogProps) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [latency, setLatency] = useState('0')
  const [remark, setRemark] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!group) return
    setName(group.name)
    setRegion(group.region)
    setLatency(String(group.avgLatency))
    setRemark(group.remark)
    setErrors({})
  }, [group])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!group) return

    const next: Record<string, string> = {}
    const latencyNumber = Number(latency)
    if (!name.trim()) next.name = '请填写节点组名称'
    if (!region.trim()) next.region = '请填写所属区域'
    if (!Number.isFinite(latencyNumber) || latencyNumber < 0) next.latency = '平均延迟需为非负数'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSave(group.id, {
      name: name.trim(),
      region: region.trim(),
      remark: remark.trim(),
      avgLatency: latencyNumber
    })
    toast.success(`节点组 ${name.trim()} 已更新`)
    onOpenChange(false)
  }

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑节点组</DialogTitle>
          <DialogDescription>节点组用于聚合线路与调度策略，修改后立即生效。</DialogDescription>
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

            <Field data-invalid={Boolean(errors.latency)}>
              <FieldLabel htmlFor="group-latency">平均延迟（ms）</FieldLabel>
              <Input
                id="group-latency"
                inputMode="numeric"
                value={latency}
                onChange={(event) => setLatency(event.target.value)}
                aria-invalid={Boolean(errors.latency)}
              />
              <FieldError errors={errors.latency ? [{ message: errors.latency }] : undefined} />
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
            <Button type="submit">
              <Save data-icon="inline-start" />
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
