import Link from 'next/link'
import { ArrowRight, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function TemporaryLandingPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Radio className="size-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sparrow Panel</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          脚手架已就绪。首页、用户端、管理端页面正在并行开发中。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">
            用户中心
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">管理后台</Link>
        </Button>
      </div>
    </div>
  )
}
