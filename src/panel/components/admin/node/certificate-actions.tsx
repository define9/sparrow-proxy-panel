'use client'

import { Download, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { AdminCertificate } from '@/lib/api/nodes'

interface CertificateActionsProps {
  certificate: AdminCertificate
  onDelete: (certificate: AdminCertificate) => void
}

export function CertificateActions({ certificate, onDelete }: CertificateActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${certificate.name} 操作`}>
          <MoreHorizontal data-icon="inline-start" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{certificate.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => toast.info('证书内容只在节点下发时提供，面板不展示明文')}
        >
          <Download data-icon="inline-start" />
          下载证书
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            toast.info(
              certificate.type === 'acme'
                ? 'ACME 续期由后续定时任务处理'
                : '自签证书请重新上传'
            )
          }
        >
          <RefreshCw data-icon="inline-start" />
          续期
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(certificate)}>
          <Trash2 data-icon="inline-start" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
