import { cn } from 'cn'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  description?: string
  className?: string
}

export function SectionHeading({ eyebrow, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex max-w-2xl flex-col gap-2', className)}>
      {eyebrow ? (
        <span className="text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</span>
      ) : null}
      <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
