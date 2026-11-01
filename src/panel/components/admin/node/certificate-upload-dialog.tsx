'use client'

import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type CertificateTypeValue = 'self-signed' | 'acme'

export const CERTIFICATE_TYPE_LABEL: Record<CertificateTypeValue, string> = {
  'self-signed': '自有',
  acme: 'ACME'
}

export interface CertificateFormValues {
  name: string
  type: CertificateTypeValue
  cert: string
  key: string
}

interface CertificateUploadDialogProps {
  open: boolean
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CertificateFormValues) => void
}

export function CertificateUploadDialog({
  open,
  pending = false,
  onOpenChange,
  onSubmit
}: CertificateUploadDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CertificateTypeValue>('self-signed')
  const [certPem, setCertPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName('')
    setType('self-signed')
    setCertPem('')
    setKeyPem('')
    setErrors({})
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = '请填写证书名称'
    if (!certPem.trim()) next.cert = '请粘贴证书 PEM'
    else if (!certPem.includes('BEGIN CERTIFICATE')) next.cert = '证书 PEM 需包含 BEGIN CERTIFICATE'
    if (!keyPem.trim()) next.key = '请粘贴私钥 PEM'
    else if (!keyPem.includes('PRIVATE KEY')) next.key = '私钥 PEM 需包含 PRIVATE KEY'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      name: name.trim(),
      type,
      cert: certPem.trim(),
      key: keyPem.trim()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>上传证书</DialogTitle>
          <DialogDescription>
            支持自有证书与 ACME 证书。私钥仅用于下发到节点，面板不会明文展示。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="cert-name">证书名称</FieldLabel>
                <Input
                  id="cert-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="如 hk.example.com"
                  aria-invalid={Boolean(errors.name)}
                />
                <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
              </Field>
              <Field>
                <FieldLabel htmlFor="cert-type">类型</FieldLabel>
                <Select
                  value={type}
                  onValueChange={(value) => setType(value as CertificateTypeValue)}
                >
                  <SelectTrigger id="cert-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self-signed">
                      {CERTIFICATE_TYPE_LABEL['self-signed']}
                    </SelectItem>
                    <SelectItem value="acme">{CERTIFICATE_TYPE_LABEL.acme}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.cert)}>
              <FieldLabel htmlFor="cert-pem">证书链（PEM）</FieldLabel>
              <Textarea
                id="cert-pem"
                value={certPem}
                onChange={(event) => setCertPem(event.target.value)}
                placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
                className="min-h-24 font-mono text-xs"
                aria-invalid={Boolean(errors.cert)}
              />
              <FieldError errors={errors.cert ? [{ message: errors.cert }] : undefined} />
            </Field>

            <Field data-invalid={Boolean(errors.key)}>
              <FieldLabel htmlFor="cert-key">私钥（PEM）</FieldLabel>
              <Textarea
                id="cert-key"
                value={keyPem}
                onChange={(event) => setKeyPem(event.target.value)}
                placeholder="粘贴私钥内容（PEM）"
                className="min-h-24 font-mono text-xs"
                aria-invalid={Boolean(errors.key)}
              />
              <FieldError errors={errors.key ? [{ message: errors.key }] : undefined} />
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
                <Upload data-icon="inline-start" />
              )}
              上传证书
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
