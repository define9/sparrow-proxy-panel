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
import type { Certificate } from '@/lib/mock/admin-nodes'

interface CertificateActionsProps {
  certificate: Certificate
  onDelete: (certificate: Certificate) => void
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
          onSelect={() => toast.success(`已下载 ${certificate.name} 的证书链`)}
        >
          <Download data-icon="inline-start" />
          下载证书
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            toast.success(
              certificate.type === 'acme'
                ? '已提交 ACME 续期任务，签发后自动下发'
                : '已生成新的自签证书，请重新下发到节点'
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
