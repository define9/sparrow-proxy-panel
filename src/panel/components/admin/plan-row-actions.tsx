'use client'

import type { Plan } from '@sparrow/contracts'
import { ArrowDownCircle, ArrowUpCircle, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface PlanRowActionsProps {
  plan: Plan
  onEdit?: (plan: Plan) => void
  onDuplicate: (plan: Plan) => void
  onToggleStatus: (plan: Plan) => void
  onDelete: (plan: Plan) => void
}

export function PlanRowActions({
  plan,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete
}: PlanRowActionsProps) {
  const active = plan.status === 'active'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`商品「${plan.name}」操作`}>
          <MoreHorizontal data-icon="inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={() => onEdit?.(plan)}>
          <Pencil data-icon="inline-start" />
          编辑
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(plan)}>
          <Copy data-icon="inline-start" />
          复制
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleStatus(plan)}>
          {active ? (
            <ArrowDownCircle data-icon="inline-start" />
          ) : (
            <ArrowUpCircle data-icon="inline-start" />
          )}
          {active ? '下架' : '上架'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(plan)}>
          <Trash2 data-icon="inline-start" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
