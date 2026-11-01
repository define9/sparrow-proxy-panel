'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface FilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  placeholder?: string
  children?: React.ReactNode
}

/** 列表页统一的筛选条：关键词搜索 + 右侧筛选项 */
export function FilterBar({ search, onSearchChange, placeholder = '搜索', children }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          data-icon="inline-start"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-64 pl-8"
        />
      </div>
      {children}
    </div>
  )
}
