'use client'

import { useQuery } from '@tanstack/react-query'
import { Info, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionHeading } from '@/components/marketing/section-heading'
import { fetchOptional } from '@/lib/api/optional'
import { formatDate } from '@/lib/format'

interface SiteAnnouncement {
  id: string
  title: string
  content: string
  level: 'info' | 'warn' | 'error'
  publishedAt: string
}

interface SiteConfig {
  name: string
  announcement: string
  announcements: SiteAnnouncement[]
}

export function Announcements() {
  const { data, isPending } = useQuery({
    queryKey: ['site'],
    queryFn: () => fetchOptional<SiteConfig>('/api/v1/public/site')
  })

  const announcements = data?.announcements ?? []

  return (
    <section id="announcements" className="scroll-mt-20">
      <SectionHeading eyebrow="公告" title="最近发生了什么" description="线路变更、维护窗口与功能更新都会在这里同步。" />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">运营公告</CardTitle>
          <CardDescription>
            {announcements.length > 0
              ? `共 ${announcements.length} 条，按发布时间倒序`
              : isPending
                ? '正在加载…'
                : '暂无公告'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {announcements.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isPending ? '正在加载站点公告…' : '站点暂时没有发布公告。'}
            </p>
          ) : (
            announcements.map((announcement) => (
              <Alert key={announcement.id}>
                {announcement.level === 'info' ? (
                  <Info className="text-info" />
                ) : (
                  <TriangleAlert className="text-warning" />
                )}
                <AlertTitle className="flex items-baseline justify-between gap-3">
                  <span>{announcement.title}</span>
                  <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground tabular-nums">
                    {formatDate(announcement.publishedAt)}
                  </span>
                </AlertTitle>
                <AlertDescription>{announcement.content}</AlertDescription>
              </Alert>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
