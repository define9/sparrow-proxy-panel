'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CopyButton } from '@/components/common/copy-button'
import {
  buildRegisterCommand,
  createNode,
  fetchNodeGroups,
  type AdminNode,
  type NodeInput
} from '@/lib/api/nodes'

const PROTOCOLS: Array<AdminNode['protocol']> = [
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'hysteria2',
  'tuic'
]

const NETWORKS: Array<AdminNode['network']> = ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']

const TLS_MODES: Array<AdminNode['tlsMode']> = ['none', 'tls', 'reality']

interface NodeCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function NodeCreateDialog({ open, onOpenChange, onCreated }: NodeCreateDialogProps) {
  const { data: groups } = useQuery({
    queryKey: ['node-groups'],
    queryFn: fetchNodeGroups,
    enabled: open
  })
  const groupList = groups?.data ?? []

  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')
  const [groupId, setGroupId] = useState('')
  const [protocol, setProtocol] = useState<AdminNode['protocol']>('vless')
  const [network, setNetwork] = useState<AdminNode['network']>('tcp')
  const [tlsMode, setTlsMode] = useState<AdminNode['tlsMode']>('tls')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null)

  const mutation = useMutation({
    mutationFn: (input: NodeInput) => createNode(input),
    onSuccess: (node) => {
      toast.success(`节点 ${node.name} 已创建`)
      setIssued({ name: node.name, token: node.registrationToken })
      onCreated()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  function reset() {
    setName('')
    setHost('')
    setPort('443')
    setGroupId('')
    setProtocol('vless')
    setNetwork('tcp')
    setTlsMode('tls')
    setErrors({})
    setIssued(null)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Record<string, string> = {}
    const portNumber = Number(port)

    if (!name.trim()) next.name = '请填写节点名称'
    if (!host.trim()) next.host = '请填写接入域名或 IP'
    if (!groupId) next.groupId = '请选择节点组'
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      next.port = '端口需为 1 - 65535 的整数'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    mutation.mutate({
      name: name.trim(),
      host: host.trim(),
      port: portNumber,
      groupId,
      protocol,
      network,
      tlsMode,
      trafficRate: 1,
      status: 'offline'
    })
  }

  const registerCommand = issued
    ? buildRegisterCommand(
        typeof window === 'undefined' ? 'https://panel.example.com' : window.location.origin,
        issued.token
      )
    : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{issued ? '节点已创建' : '新建节点'}</DialogTitle>
          <DialogDescription>
            {issued
              ? '在节点服务器上执行下面的注册命令，Agent 会自动拉取配置并在 30 秒内上线。'
              : '创建后生成一次性注册令牌，在节点上执行 sparrow-agent register 即可接入。'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" data-icon="inline-start" />
              <span className="font-mono font-medium">{issued.name}</span>
            </div>
            <div className="overflow-hidden rounded-lg border bg-muted/40">
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-xs text-muted-foreground">一次性令牌，24 小时内有效</span>
                <CopyButton value={registerCommand} label="复制命令" />
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
                {registerCommand}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              令牌只在创建后 24 小时内有效；节点注册成功后密钥只下发一次，请妥善保存。
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.name)}>
                  <FieldLabel htmlFor="node-name">节点名称</FieldLabel>
                  <Input
                    id="node-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="如 hk-04"
                    aria-invalid={Boolean(errors.name)}
                  />
                  <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
                </Field>
                <Field data-invalid={Boolean(errors.host)}>
                  <FieldLabel htmlFor="node-host">接入域名 / IP</FieldLabel>
                  <Input
                    id="node-host"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="hk04.example.com"
                    aria-invalid={Boolean(errors.host)}
                  />
                  <FieldError errors={errors.host ? [{ message: errors.host }] : undefined} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.port)}>
                  <FieldLabel htmlFor="node-port">端口</FieldLabel>
                  <Input
                    id="node-port"
                    inputMode="numeric"
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    aria-invalid={Boolean(errors.port)}
                  />
                  <FieldError errors={errors.port ? [{ message: errors.port }] : undefined} />
                </Field>
                <Field data-invalid={Boolean(errors.groupId)}>
                  <FieldLabel htmlFor="node-group">节点组</FieldLabel>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger id="node-group" className="w-full">
                      <SelectValue placeholder="选择节点组" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupList.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name} · {group.region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    errors={errors.groupId ? [{ message: errors.groupId }] : undefined}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="node-protocol">协议</FieldLabel>
                  <Select
                    value={protocol}
                    onValueChange={(value) => setProtocol(value as AdminNode['protocol'])}
                  >
                    <SelectTrigger id="node-protocol" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="node-network">传输</FieldLabel>
                  <Select
                    value={network}
                    onValueChange={(value) => setNetwork(value as AdminNode['network'])}
                  >
                    <SelectTrigger id="node-network" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="node-tls">TLS</FieldLabel>
                  <Select
                    value={tlsMode}
                    onValueChange={(value) => setTlsMode(value as AdminNode['tlsMode'])}
                  >
                    <SelectTrigger id="node-tls" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TLS_MODES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item === 'none' ? '无' : item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                创建节点
              </Button>
            </DialogFooter>
          </form>
        )}

        {issued ? (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>完成</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
