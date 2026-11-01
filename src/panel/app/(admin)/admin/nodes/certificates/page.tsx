'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { CertificateActions } from '@/components/admin/node/certificate-actions'
import { CertificateUploadDialog } from '@/components/admin/node/certificate-upload-dialog'
import { daysLeft, formatDay } from '@/lib/format'
import {
  CERTIFICATE_SOURCE_LABEL,
  CERTIFICATE_TYPE_LABEL,
  certificates as seedCertificates,
  expiringCertificates,
  type Certificate
} from '@/lib/mock/admin-nodes'
import { cn } from 'cn'

function ExpiryCell({ certificate }: { certificate: Certificate }) {
  const left = daysLeft(certificate.expiresAt)
  const tone = left < 0 ? 'text-destructive' : left <= 30 ? 'text-warning' : undefined

  return (
    <div className={cn('flex flex-col gap-0.5', tone)}>
      <span className="font-mono text-xs tabular-nums">{formatDay(certificate.expiresAt)}</span>
      <span className="text-xs">
        {left < 0 ? `已过期 ${Math.abs(left)} 天` : `剩余 ${left} 天`}
      </span>
    </div>
  )
}

export default function AdminCertificatesPage() {
  const [certificateList, setCertificateList] = useState<Certificate[]>(seedCertificates)
  const [uploadOpen, setUploadOpen] = useState(false)

  const expiring = useMemo(
    () => expiringCertificates(certificateList, 7),
    [certificateList]
  )
  const expiredCount = useMemo(
    () => certificateList.filter((certificate) => daysLeft(certificate.expiresAt) < 0).length,
    [certificateList]
  )

  function handleDelete(certificate: Certificate) {
    setCertificateList((prev) => prev.filter((item) => item.id !== certificate.id))
    toast.success(`已删除证书 ${certificate.name}`)
  }

  const columns: ColumnDef<Certificate>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.domains.length} 个域名 · {row.original.autoRenew ? '自动续期' : '手动续期'}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => (
        <Badge variant={row.original.type === 'acme' ? 'info' : 'secondary'}>
          {CERTIFICATE_TYPE_LABEL[row.original.type]}
        </Badge>
      )
    },
    {
      accessorKey: 'issuer',
      header: '签发者',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.issuer}</span>
      )
    },
    {
      accessorKey: 'validFrom',
      header: '生效时间',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDay(row.original.validFrom)}
        </span>
      )
    },
    {
      accessorKey: 'expiresAt',
      header: '到期时间',
      cell: ({ row }) => <ExpiryCell certificate={row.original} />
    },
    {
      accessorKey: 'source',
      header: '来源',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {CERTIFICATE_SOURCE_LABEL[row.original.source]}
        </span>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <CertificateActions certificate={row.original} onDelete={handleDelete} />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="证书"
        description="管理节点使用的 TLS 证书，支持自有证书与 ACME 自动续期"
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload data-icon="inline-start" />
            上传证书
          </Button>
        }
      />

      {expiring.length > 0 ? (
        <Alert className="border-warning/40 bg-warning/10">
          <ShieldAlert className="text-warning" data-icon="inline-start" />
          <AlertTitle className="text-warning">
            {expiring.length} 张证书将在 7 天内到期
          </AlertTitle>
          <AlertDescription>
            {expiring.map((certificate) => certificate.name).join('、')} 即将到期，ACME
            证书会自动续期，自有证书请及时上传新证书。
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-success/30 bg-success/5">
          <ShieldCheck className="text-success" data-icon="inline-start" />
          <AlertTitle>证书状态良好</AlertTitle>
          <AlertDescription>7 天内没有证书到期。</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          共 {certificateList.length} 张证书
          {expiredCount > 0 ? ` · ${expiredCount} 张已过期` : ''}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={certificateList}
        emptyTitle="暂无证书"
        emptyDescription="上传证书后即可绑定到启用了 TLS 的节点。"
      />

      <CertificateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={(certificate) => setCertificateList((prev) => [certificate, ...prev])}
      />
    </>
  )
}
