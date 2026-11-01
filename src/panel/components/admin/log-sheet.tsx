'use client'

import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate } from '@/lib/format'
import { logCategoryLabels, type AdminLogEntry, type LogLevel } from '@/lib/mock/admin-ops'

const levelMeta: Record<LogLevel, { variant: 'info' | 'warning' | 'destructive'; label: string }> = {
  info: { variant: 'info', label: 'INFO' },
  warn: { variant: 'warning', label: 'WARN' },
  error: { variant: 'destructive', label: 'ERROR' }
}

interface LogSheetProps {
  log: AdminLogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogSheet({ log, open, onOpenChange }: LogSheetProps) {
  if (!log) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Badge variant={levelMeta[log.level].variant}>{levelMeta[log.level].label}</Badge>
            <span className="font-mono text-sm">{log.action}</span>
          </SheetTitle>
          <SheetDescription>{log.message}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>时间</FieldLabel>
              <p className="font-mono text-xs">{formatDate(log.createdAt)}</p>
            </Field>
            <Field>
              <FieldLabel>分类</FieldLabel>
              <p className="text-sm">{logCategoryLabels[log.category]}</p>
            </Field>
            <Field>
              <FieldLabel>操作者</FieldLabel>
              <p className="text-sm break-all">{log.actor}</p>
            </Field>
            <Field>
              <FieldLabel>目标</FieldLabel>
              <p className="font-mono text-xs break-all">{log.target}</p>
            </Field>
            <Field>
              <FieldLabel>IP</FieldLabel>
              <p className="font-mono text-xs">{log.ip ?? '—'}</p>
            </Field>
            <Field>
              <FieldLabel>日志 ID</FieldLabel>
              <p className="font-mono text-xs">{log.id}</p>
            </Field>
          </FieldGroup>

          <div className="mt-5 flex flex-col gap-2">
            <span className="text-sm font-medium">payload</span>
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
