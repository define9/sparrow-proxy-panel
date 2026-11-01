'use client'

import type { Node } from '@sparrow/contracts'
import {
  CircleCheck,
  CircleX,
  Clock,
  Cpu,
  KeyRound,
  Network,
  ShieldCheck,
  Terminal,
  TriangleAlert
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { CopyButton } from '@/components/common/copy-button'
import { StateBadge } from '@/components/common/state-badge'
import { formatDate, formatRelative } from '@/lib/format'
import {
  CERTIFICATE_TYPE_LABEL,
  nodeCertificate,
  nodeEvents,
  registerCommand,
  type NodeEventLevel
} from '@/lib/mock/admin-nodes'
import { cn } from 'cn'

const TLS_LABEL: Record<Node['tlsMode'], string> = {
  none: '无',
  tls: 'TLS',
  reality: 'REALITY'
}

const EVENT_ICON: Record<NodeEventLevel, typeof CircleCheck> = {
  info: CircleCheck,
  warning: TriangleAlert,
  error: CircleX
}

const EVENT_TONE: Record<NodeEventLevel, string> = {
  info: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive'
}

function DetailItem({
  label,
  value,
  mono = false
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  )
}

function ResourceBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value.toFixed(1)}%</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  )
}

interface NodeDetailSheetProps {
  node: Node | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeDetailSheet({ node, open, onOpenChange }: NodeDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 sm:max-w-xl">
        {node ? (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="flex items-center gap-2">
                <span className="font-mono">{node.name}</span>
                <StateBadge status={node.status} />
              </SheetTitle>
              <SheetDescription>
                {node.groupName} · {node.protocol.toUpperCase()} · {node.host}:{node.port}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Cpu data-icon="inline-start" className="size-4 text-muted-foreground" />
                  资源占用
                </h3>
                <ResourceBar label="CPU" value={node.cpu} />
                <ResourceBar label="内存" value={node.memory} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock data-icon="inline-start" className="size-3.5" />
                    最后心跳 {formatRelative(node.lastSeenAt)}
                  </span>
                  <span>在线 {node.onlineUsers} 人</span>
                </div>
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Network data-icon="inline-start" className="size-4 text-muted-foreground" />
                  协议参数
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem
                    label="协议"
                    value={<Badge variant="outline">{node.protocol.toUpperCase()}</Badge>}
                  />
                  <DetailItem label="传输" value={node.network.toUpperCase()} mono />
                  <DetailItem label="TLS" value={TLS_LABEL[node.tlsMode]} />
                  <DetailItem label="倍率" value={`×${node.rate}`} mono />
                  <DetailItem label="地址" value={`${node.host}:${node.port}`} mono />
                  <DetailItem label="内核" value={`${node.core} · Agent ${node.agentVersion}`} />
                  <DetailItem label="节点 ID" value={node.id} mono />
                  <DetailItem label="接入时间" value={formatDate(node.createdAt)} />
                </div>
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck data-icon="inline-start" className="size-4 text-muted-foreground" />
                  证书
                </h3>
                {(() => {
                  const cert = nodeCertificate(node)
                  if (!cert) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        该节点未启用 TLS，无需证书。
                      </p>
                    )
                  }
                  return (
                    <div className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm">{cert.name}</span>
                        <Badge variant={cert.type === 'acme' ? 'info' : 'secondary'}>
                          {CERTIFICATE_TYPE_LABEL[cert.type]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>签发者 {cert.issuer}</span>
                        <span className="font-mono tabular-nums">
                          到期 {formatDate(cert.expiresAt)}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">最近事件</h3>
                <ol className="flex flex-col gap-3">
                  {nodeEvents(node).map((event) => {
                    const Icon = EVENT_ICON[event.level]
                    return (
                      <li key={event.id} className="flex gap-2.5">
                        <Icon
                          data-icon="inline-start"
                          className={cn('mt-0.5 size-4 shrink-0', EVENT_TONE[event.level])}
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{event.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(event.at)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{event.detail}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>

              <Separator />

              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Terminal data-icon="inline-start" className="size-4 text-muted-foreground" />
                  生成注册命令
                </h3>
                <div className="overflow-hidden rounded-lg border bg-muted/40">
                  <div className="flex items-center justify-between border-b px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <KeyRound data-icon="inline-start" className="size-3.5" />
                      一次性令牌，24 小时内有效
                    </span>
                    <CopyButton value={registerCommand(node)} label="复制命令" />
                  </div>
                  <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
                    {registerCommand(node)}
                  </pre>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
