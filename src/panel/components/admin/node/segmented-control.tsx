'use client'

import { Button } from '@/components/ui/button'
import { cn } from 'cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

/** 轻量分段控制器（ToggleGroup 语义：role=group + aria-pressed） */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="toggle-group"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={active ? 'secondary' : 'ghost'}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-6 px-2.5 text-xs',
              active ? 'text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
