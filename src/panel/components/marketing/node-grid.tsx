'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StateBadge } from '@/components/common/state-badge'
import { SectionHeading } from '@/components/marketing/section-heading'
import { nodes, nodeGroups } from '@/lib/mock/catalog'
import { fetchOptional } from '@/lib/api/optional'
import { cn } from 'cn'

interface PanelStatus {
  status: 'ok' | 'degraded'
  uptimeSeconds: number
  nodes: { total: number; online: number }
}

export function NodeGrid() {
  const groups = [...nodeGroups].sort((a, b) => a.sort - b.sort)

  const { data: status } = useQuery({
    queryKey: ['public-status'],
    queryFn: () => fetchOptional<PanelStatus>('/api/v1/public/status'),
    refetchInterval: 60_000
  })

  const onlineCount = status?.nodes.online
  const totalCount = status?.nodes.total

  const description =
    status && typeof onlineCount === 'number' && typeof totalCount === 'number'
      ? `当前 ${onlineCount} / ${totalCount} 个节点在线；节点由 Agent 上报心跳与负载，离线节点会自动从订阅里摘除。`
      : '节点由 Agent 上报心跳与负载，面板聚合后展示；离线节点会自动从订阅里摘除。'

  return (
    <section id="nodes" className="scroll-mt-20 border-y bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="节点" title="线路状态实时可见" description={description} />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {groups.map((group) => {
            const groupNodes = nodes.filter((node) => node.groupId === group.id)
            const groupOnline = groupNodes.filter((node) => node.status === 'online').length

            return (
              <Card key={group.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{group.name}</span>
                    <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                      {groupOnline} / {groupNodes.length} 在线
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {group.region} · {group.remark}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col">
                  {groupNodes.map((node) => (
                    <div
                      key={node.id}
                      className={cn(
                        'flex items-center justify-between gap-3 border-b py-2.5 first:pt-0 last:border-0 last:pb-0',
                        node.status !== 'online' && 'opacity-60'
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-mono text-sm font-medium">{node.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {node.protocol.toUpperCase()} · {node.network} · 倍率 {node.rate}x
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {node.onlineUsers} 人
                        </span>
                        <StateBadge status={node.status} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
