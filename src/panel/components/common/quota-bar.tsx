import { cn } from 'cn'
import { Progress } from '@/components/ui/progress'
import { formatBytes, percent } from '@/lib/format'

interface QuotaBarProps {
  used: number
  limit: number
  className?: string
  showLabel?: boolean
}

export function QuotaBar({ used, limit, className, showLabel = true }: QuotaBarProps) {
  const value = limit > 0 ? percent(used, limit) : 0
  const tone = value >= 95 ? 'text-destructive' : value >= 80 ? 'text-warning' : 'text-muted-foreground'

  return (
    <div className={cn('flex min-w-40 flex-col gap-1.5', className)}>
      <Progress value={value} className="h-1.5" />
      {showLabel ? (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatBytes(used)}
            <span className="mx-1">/</span>
            {limit > 0 ? formatBytes(limit) : '不限'}
          </span>
          <span className={cn('font-mono tabular-nums', tone)}>{limit > 0 ? `${value}%` : '∞'}</span>
        </div>
      ) : null}
    </div>
  )
}
