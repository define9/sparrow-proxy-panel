'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleCheck,
  CircleX,
  Clock,
  Cpu,
  KeyRound,
  Network,
  RefreshCw,
  ShieldCheck,
  Terminal,
  TriangleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  buildRegisterCommand,
  fetchNode,
  syncNode,
  type AdminNodeDetail,
  type AgentEventRecord
} from '@/lib/api/nodes'
import { cn } from 'cn'

const TLS_LABEL: Record<AdminNodeDetail['tlsMode'], string> = {
  none: '无',
  tls: 'TLS',
  reality: 'REALITY'
}

type EventTone = 'info' | 'warning' | 'error'

function eventTone(level: string): EventTone {
  if (level === 'error') return 'error'
  if (level === 'warn' || level === 'warning') return 'warning'
  return 'info'
}

const EVENT_ICON: Record<EventTone, typeof CircleCheck> = {
  info: CircleCheck,
  warning: TriangleAlert,
  error: CircleX
}

const EVENT_TONE: Record<EventTone, string> = {
  info: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive'
}

const COMMAND_STATUS_LABEL: Record<string, string> = {
  pending: '待执行',
  acked: '已回执',
  success: '已成功',
  failed: '失败'
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

function eventTitle(event: AgentEventRecord) {
  if (event.message) return event.message
  return event.type
}

interface NodeDetailSheetProps {
  nodeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSynced?: () => void
}

export function NodeDetailSheet({ nodeId, open, onOpenChange, onSynced }: NodeDetailSheetProps) {
  const queryClient = useQueryClient()

  const { data: node, isPending } = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => fetchNode(nodeId as string),
    enabled: open && Boolean(nodeId)
  })

  const syncMutation = useMutation({
    mutationFn: () => syncNode(nodeId as string),
    onSuccess: (result) => {
      toast.success(`已下发配置 v${result.configVersion}`)
      queryClient.invalidateQueries({ queryKey: ['node', nodeId] })
      onSynced?.()
    },
    onError: (error: Error) => toast.error(error.message)
  })

  const registerCommand =
    node?.registrationToken && typeof window !== 'undefined'
      ? buildRegisterCommand(window.location.origin, node.registrationToken)
      : null

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
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Cpu data-icon="inline-start" className="size-4 text-muted-foreground" />
                    资源占用
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                  >
                    <RefreshCw data-icon="inline-start" />
                    同步配置
                  </Button>
                </div>
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
                  <DetailItem
                    label="内核"
                    value={`${node.core} · Agent ${node.agentVersion ?? '待注册'}`}
                  />
                  <DetailItem label="配置版本" value={`v${node.configVersion}`} mono />
                  <DetailItem label="节点 ID" value={node.id} mono />
                  <DetailItem label="接入时间" value={formatDate(node.createdAt)} />
                </div>
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck data-icon="inline-start" className="size-4 text-muted-foreground" />
                  接入状态
                </h3>
                <div className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {node.agentRegistered ? 'Agent 已注册' : '等待 Agent 注册'}
                    </span>
                    <Badge variant={node.agentRegistered ? 'success' : 'secondary'}>
                      {node.agentRegistered ? '已接入' : '未接入'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>最后心跳 {formatRelative(node.lastSeenAt)}</span>
                    <span className="font-mono tabular-nums">config v{node.configVersion}</span>
                  </div>
                </div>
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">最近事件</h3>
                {node.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无事件上报。</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {node.events.map((event) => {
                      const tone = eventTone(event.level)
                      const Icon = EVENT_ICON[tone]
                      return (
                        <li key={event.id} className="flex gap-2.5">
                          <Icon
                            data-icon="inline-start"
                            className={cn('mt-0.5 size-4 shrink-0', EVENT_TONE[tone])}
                          />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{eventTitle(event)}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelative(event.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {event.type} · {event.level}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">命令历史</h3>
                {node.commands.length === 0 ? (
                  <p className="text-sm text-muted-foreground">还没有下发过命令。</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {node.commands.map((command) => (
                      <li
                        key={command.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-mono text-xs">{command.command}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(command.issuedAt)}
                          </span>
                        </div>
                        <Badge variant="outline">
                          {COMMAND_STATUS_LABEL[command.status] ?? command.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Terminal data-icon="inline-start" className="size-4 text-muted-foreground" />
                  生成注册命令
                </h3>
                {registerCommand ? (
                  <div className="overflow-hidden rounded-lg border bg-muted/40">
                    <div className="flex items-center justify-between border-b px-3 py-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <KeyRound data-icon="inline-start" className="size-3.5" />
                        一次性令牌，24 小时内有效
                      </span>
                      <CopyButton value={registerCommand} label="复制命令" />
                    </div>
                    <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
                      {registerCommand}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Agent 已接入，密钥只下发过一次；如需重新注册请轮换节点密钥。
                  </p>
                )}
              </section>
            </div>
          </>
        ) : isPending ? (
          <div className="flex flex-col gap-3 p-4">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-24 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
