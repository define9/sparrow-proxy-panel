'use client'

import { Info, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionHeading } from '@/components/marketing/section-heading'
import { formatDate } from '@/lib/format'
import { announcements } from '@/lib/mock/catalog'

export function Announcements() {
  return (
    <section id="announcements" className="scroll-mt-20">
      <SectionHeading eyebrow="公告" title="最近发生了什么" description="线路变更、维护窗口与功能更新都会在这里同步。" />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">运营公告</CardTitle>
          <CardDescription>共 {announcements.length} 条，按发布时间倒序</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <Alert key={announcement.id}>
              {announcement.level === 'warning' ? (
                <TriangleAlert className="text-warning" />
              ) : (
                <Info className="text-info" />
              )}
              <AlertTitle className="flex items-baseline justify-between gap-3">
                <span>{announcement.title}</span>
                <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground tabular-nums">
                  {formatDate(announcement.publishedAt)}
                </span>
              </AlertTitle>
              <AlertDescription>{announcement.content}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
