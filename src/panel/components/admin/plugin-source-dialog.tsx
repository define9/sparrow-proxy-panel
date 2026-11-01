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
import { Switch } from '@/components/ui/switch'
import type { PluginSourceDto } from '@/lib/api/admin'

export type SourceType = PluginSourceDto['type']

const pluginSourceTypeLabels: Record<SourceType, string> = {
  url: 'HTTP JSON',
  git: 'Git 仓库',
  marketplace: '官方市场'
}

export interface NewSourceInput {
  name: string
  type: SourceType
  url: string
  enabled: boolean
}

interface PluginSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: NewSourceInput) => Promise<void> | void
}

const PLACEHOLDER: Record<SourceType, string> = {
  url: 'https://example.com/plugins.json',
  git: 'https://github.com/owner/plugin-index',
  marketplace: 'https://marketplace.sparrow.dev/index.json'
}

export function PluginSourceDialog({ open, onOpenChange, onSubmit }: PluginSourceDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SourceType>('url')
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const invalid = Boolean(url.trim()) && !/^https:\/\//.test(url.trim())

  function reset() {
    setName('')
    setType('url')
    setUrl('')
    setEnabled(true)
  }

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
          <DialogTitle>新建索引源</DialogTitle>
          <DialogDescription>索引源只做发现，同步后仅标记可安装项，不会自动安装或升级。</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="source-name">名称</FieldLabel>
            <Input
              id="source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="如：社区精选索引"
            />
          </Field>
          <Field>
            <FieldLabel>类型</FieldLabel>
            <Select value={type} onValueChange={(value) => setType(value as SourceType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(pluginSourceTypeLabels) as SourceType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {pluginSourceTypeLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="source-url">地址</FieldLabel>
            <Input
              id="source-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={PLACEHOLDER[type]}
              aria-invalid={invalid}
            />
            <FieldDescription>
              {invalid ? '只允许 https 地址' : 'gzip 拉取，按 ETag 增量同步；不会 clone 仓库。'}
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Switch id="source-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <FieldLabel htmlFor="source-enabled">创建后立即启用并同步</FieldLabel>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!name.trim() || !url.trim() || invalid || submitting}
            onClick={async () => {
              setSubmitting(true)
              try {
                await onSubmit({ name: name.trim(), type, url: url.trim(), enabled })
                toast.success(`已创建索引源「${name.trim()}」`)
                reset()
                onOpenChange(false)
              } catch (error) {
                toast.error((error as Error).message)
              } finally {
                setSubmitting(false)
              }
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
