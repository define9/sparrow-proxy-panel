'use client'

import type { Node } from '@sparrow/contracts'
import { MoreHorizontal, Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
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

interface NodeActionsProps {
  node: Node
  onEdit: (node: Node) => void
  onDelete: (node: Node) => void
}

export function NodeActions({ node, onEdit, onDelete }: NodeActionsProps) {
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
          onSelect={() => toast.success(`已向 ${node.name} 下发同步指令`)}
        >
          <RefreshCw data-icon="inline-start" />
          同步配置
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => toast.success(`已重启 ${node.name} 的 ${node.core} 内核`)}
        >
          <RotateCcw data-icon="inline-start" />
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
