import { cn } from 'cn'

export function InfoList({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <dl className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</dl>
}

export function InfoItem({
  label,
  children,
  mono = false,
  className
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-sm break-words', mono && 'font-mono tabular-nums')}>
        {children}
      </dd>
    </div>
  )
}
