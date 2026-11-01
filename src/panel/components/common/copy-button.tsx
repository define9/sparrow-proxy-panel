'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CopyButton({ value, label = '复制', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('复制失败，请手动选择文本')
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" className={className} onClick={copy}>
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? '已复制' : label}
    </Button>
  )
}
