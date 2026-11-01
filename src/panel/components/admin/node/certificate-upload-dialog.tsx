'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CERTIFICATE_TYPE_LABEL,
  type Certificate,
  type CertificateType
} from '@/lib/mock/admin-nodes'
import { iso } from '@/lib/mock/util'

interface CertificateUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (certificate: Certificate) => void
}

export function CertificateUploadDialog({
  open,
  onOpenChange,
  onUpload
}: CertificateUploadDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CertificateType>('self-signed')
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

    onUpload({
      id: `cert_new_${Date.now()}`,
      name: name.trim(),
      type,
      issuer: type === 'acme' ? '待 ACME 签发' : 'Sparrow Internal CA',
      domains: [name.trim()],
      validFrom: iso(0),
      expiresAt: iso(type === 'acme' ? 90 : 365),
      source: type === 'acme' ? 'acme' : 'manual',
      autoRenew: type === 'acme'
    })
    toast.success(`证书 ${name.trim()} 已上传`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  onValueChange={(value) => setType(value as CertificateType)}
                >
                  <SelectTrigger id="cert-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self-signed">{CERTIFICATE_TYPE_LABEL['self-signed']}</SelectItem>
                    <SelectItem value="acme">{CERTIFICATE_TYPE_LABEL.acme}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.cert)}>
              <FieldLabel htmlFor="cert-pem">证书 PEM</FieldLabel>
              <Textarea
                id="cert-pem"
                value={certPem}
                onChange={(event) => setCertPem(event.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                className="min-h-24 font-mono text-xs"
                aria-invalid={Boolean(errors.cert)}
              />
              <FieldError errors={errors.cert ? [{ message: errors.cert }] : undefined} />
            </Field>

            <Field data-invalid={Boolean(errors.key)}>
              <FieldLabel htmlFor="cert-key">私钥 PEM</FieldLabel>
              <Textarea
                id="cert-key"
                value={keyPem}
                onChange={(event) => setKeyPem(event.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----"
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
            <Button type="submit">
              <Upload data-icon="inline-start" />
              上传
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
