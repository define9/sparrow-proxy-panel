'use client'

import { Plus } from 'lucide-react'
import { SectionHeading } from '@/components/marketing/section-heading'
import { faqs } from '@/lib/mock/marketing'

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 border-t bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16">
        <SectionHeading
          eyebrow="常见问题"
          title="部署之前，你可能想知道"
          description="没有找到答案？登录控制台后在工单里提问，通常一小时内回复。"
        />

        <div className="grid gap-3 md:grid-cols-2">
          {faqs.map((faq) => (
            <details key={faq.question} className="group rounded-xl border bg-card px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium marker:hidden">
                {faq.question}
                <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
              </summary>
              <p className="pt-2 text-sm text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
