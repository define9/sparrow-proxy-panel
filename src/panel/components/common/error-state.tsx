'use client'

import { AlertTriangle } from 'lucide-react'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

/** 数据加载失败时的统一占位，带重试入口 */
export function ErrorState({
  title = '加载失败',
  description = '请求没有成功，请检查网络后重试。',
  onRetry
}: ErrorStateProps) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            重试
          </Button>
        ) : null
      }
    />
  )
}
