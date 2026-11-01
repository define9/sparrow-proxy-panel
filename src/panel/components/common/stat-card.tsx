import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from 'cn'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  trend?: { value: string; positive?: boolean }
  className?: string
}

export function StatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardDescription>{label}</CardDescription>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend ? (
            <span className={trend.positive ? 'text-success' : 'text-destructive'}>{trend.value}</span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
