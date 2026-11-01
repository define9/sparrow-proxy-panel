import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SparrowMark } from '@/components/brand/sparrow-mark'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <SparrowMark className="size-7 shrink-0" />
            Sparrow
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
            <Link href="/#plans" className="hover:text-foreground">套餐</Link>
            <Link href="/#nodes" className="hover:text-foreground">节点状态</Link>
            <Link href="/#faq" className="hover:text-foreground">常见问题</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">登录</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">免费试用</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Sparrow Proxy Panel</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">控制台</Link>
            <Link href="/#faq" className="hover:text-foreground">帮助</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
