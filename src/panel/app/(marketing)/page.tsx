'use client'

import { Announcements } from '@/components/marketing/announcements'
import { BottomCta } from '@/components/marketing/bottom-cta'
import { FaqSection } from '@/components/marketing/faq-section'
import { Hero } from '@/components/marketing/hero'
import { NodeGrid } from '@/components/marketing/node-grid'
import { PlanGrid } from '@/components/marketing/plan-grid'

export default function HomePage() {
  return (
    <>
      <Hero />
      <PlanGrid />
      <NodeGrid />
      <div className="mx-auto w-full max-w-6xl px-4 py-16">
        <Announcements />
      </div>
      <FaqSection />
      <BottomCta />
    </>
  )
}
