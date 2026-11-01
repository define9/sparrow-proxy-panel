'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/common/data-table'
import { PageHeader } from '@/components/common/page-header'
import { CertificateActions } from '@/components/admin/node/certificate-actions'
import {
  CertificateUploadDialog,
  type CertificateFormValues
} from '@/components/admin/node/certificate-upload-dialog'
import { queryKeys } from '@/lib/api/client'
import {
  createCertificate,
  deleteCertificate,
  fetchCertificates,
  type AdminCertificate
} from '@/lib/api/nodes'
import { formatDay } from '@/lib/format'
import { cn } from 'cn'

const CERTIFICATE_TYPE_LABEL: Record<string, string> = {
  'self-signed': '自有',
  acme: 'ACME',
  generic: '通用'
}

const CERTIFICATE_SOURCE_LABEL: Record<string, string> = {
  manual: '手动上传',
  acme: 'ACME 自动续期',
  imported: '历史导入'
}

function ExpiryCell({ certificate }: { certificate: AdminCertificate }) {
  const left = certificate.daysLeft
  const tone =
    left === null ? undefined : left < 0 ? 'text-destructive' : left <= 30 ? 'text-warning' : undefined

  return (
    <div className={cn('flex flex-col gap-0.5', tone)}>
      <span className="font-mono text-xs tabular-nums">{formatDay(certificate.notAfter)}</span>
      <span className="text-xs">
        {left === null ? '未解析' : left < 0 ? `已过期 ${Math.abs(left)} 天` : `剩余 ${left} 天`}
      </span>
    </div>
  )
}

export default function AdminCertificatesPage() {
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)

  const certificatesQuery = useQuery({
    queryKey: queryKeys.certificates,
    queryFn: fetchCertificates
  })

  const certificateList = useMemo(() => certificatesQuery.data?.data ?? [], [certificatesQuery.data])

  const expiring = useMemo(
    () =>
      certificateList.filter(
        (certificate) =>
          certificate.daysLeft !== null && certificate.daysLeft >= 0 && certificate.daysLeft <= 7
      ),
    [certificateList]
  )
  const expiredCount = useMemo(
    () =>
      certificateList.filter(
        (certificate) => certificate.daysLeft !== null && certificate.daysLeft < 0
      ).length,
    [certificateList]
  )

  const createMutation = useMutation({
    mutationFn: (values: CertificateFormValues) =>
      createCertificate({
        name: values.name,
        type: values.type,
        cert: values.cert,
        key: values.key
      }),
    onSuccess: (certificate) => {
      toast.success(`证书 ${certificate.name} 已上传`)
      setUploadOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.certificates })
    },
    onError: (error: Error) => toast.error(error.message)
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCertificate(id),
    onSuccess: () => {
      toast.success('证书已删除')
      queryClient.invalidateQueries({ queryKey: queryKeys.certificates })
    },
    onError: (error: Error) => toast.error(error.message)
  })

  const columns: ColumnDef<AdminCertificate>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.autoRenew ? '自动续期' : '手动续期'}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => (
        <Badge variant={row.original.type === 'acme' ? 'info' : 'secondary'}>
          {CERTIFICATE_TYPE_LABEL[row.original.type] ?? row.original.type}
        </Badge>
      )
    },
    {
      accessorKey: 'issuer',
      header: '签发者',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.issuer ?? '—'}</span>
      )
    },
    {
      accessorKey: 'notBefore',
      header: '生效时间',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDay(row.original.notBefore)}
        </span>
      )
    },
    {
      accessorKey: 'notAfter',
      header: '到期时间',
      cell: ({ row }) => <ExpiryCell certificate={row.original} />
    },
    {
      accessorKey: 'source',
      header: '来源',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {CERTIFICATE_SOURCE_LABEL[row.original.source] ?? row.original.source}
        </span>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <CertificateActions
            certificate={row.original}
            onDelete={(certificate) => deleteMutation.mutate(certificate.id)}
          />
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

      {certificatesQuery.isPending ? (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={certificateList}
          emptyTitle="暂无证书"
          emptyDescription="上传证书后即可绑定到启用了 TLS 的节点。"
        />
      )}

      <CertificateUploadDialog
        open={uploadOpen}
        pending={createMutation.isPending}
        onOpenChange={setUploadOpen}
        onSubmit={(values) => createMutation.mutate(values)}
      />
    </>
  )
}
