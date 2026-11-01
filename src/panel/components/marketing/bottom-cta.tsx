import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function BottomCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <Card className="bg-muted/40 ring-primary/20">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            十分钟，把自己的订阅生意跑起来
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            部署 Panel、注册一个节点 Agent，剩下的交给面板：套餐、支付、订阅与流量统计开箱即用。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                免费试用
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">登录控制台</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
