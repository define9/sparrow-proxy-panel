import Link from 'next/link'
import { SparrowMark } from '@/components/brand/sparrow-mark'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="flex items-center justify-center gap-2">
            <SparrowMark className="size-9 shrink-0" />
            <span className="text-lg font-semibold tracking-tight">Sparrow Panel</span>
          </Link>
          {children}
        </div>
      </div>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Sparrow Proxy Panel · 演示数据
      </footer>
    </div>
  )
}
