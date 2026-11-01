'use client'

import { useMutation } from '@tanstack/react-query'
import { MoreHorizontal, Pencil, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
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
import { syncNode, type AdminNode } from '@/lib/api/nodes'

interface NodeActionsProps {
  node: AdminNode
  onEdit: (node: AdminNode) => void
  onDelete: (node: AdminNode) => void
  onSynced?: () => void
}

export function NodeActions({ node, onEdit, onDelete, onSynced }: NodeActionsProps) {
  const syncMutation = useMutation({
    mutationFn: () => syncNode(node.id),
    onSuccess: (result) => {
      toast.success(`已向 ${node.name} 下发配置 v${result.configVersion}`)
      onSynced?.()
    },
    onError: (error: Error) => toast.error(error.message)
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${node.name} 操作`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal data-icon="inline-start" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{node.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={syncMutation.isPending}
          onSelect={(event) => {
            event.preventDefault()
            syncMutation.mutate()
          }}
        >
          <RefreshCw data-icon="inline-start" />
          同步配置
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => toast.info(`重启内核需要在 Agent 侧执行（节点 ${node.name}）`)}
        >
          <RotateCw data-icon="inline-start" />
          重启内核
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(node)}>
          <Pencil data-icon="inline-start" />
          编辑
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(node)}>
          <Trash2 data-icon="inline-start" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
