'use client'

import type { Plan } from '@sparrow/contracts'
import { ArrowDownCircle, ArrowUpCircle, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
  onDuplicate: (plan: Plan) => void
  onToggleStatus: (plan: Plan) => void
  onDelete: (plan: Plan) => void
}

export function PlanRowActions({ plan, onDuplicate, onToggleStatus, onDelete }: PlanRowActionsProps) {
  const active = plan.status === 'active'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`商品「${plan.name}」操作`}>
          <MoreHorizontal data-icon="inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={() => toast.info(`编辑「${plan.name}」：演示环境不保存修改`)}>
          <Pencil data-icon="inline-start" />
          编辑
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onDuplicate(plan)
            toast.success(`已复制「${plan.name}」为副本`)
          }}
        >
          <Copy data-icon="inline-start" />
          复制
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onToggleStatus(plan)
            toast.success(active ? `「${plan.name}」已下架` : `「${plan.name}」已上架`)
          }}
        >
          {active ? (
            <ArrowDownCircle data-icon="inline-start" />
          ) : (
            <ArrowUpCircle data-icon="inline-start" />
          )}
          {active ? '下架' : '上架'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            onDelete(plan)
            toast.success(`已删除「${plan.name}」`)
          }}
        >
          <Trash2 data-icon="inline-start" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
