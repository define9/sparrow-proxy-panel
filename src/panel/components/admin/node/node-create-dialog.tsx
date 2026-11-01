'use client'

import { useState } from 'react'
import type { Node } from '@sparrow/contracts'
import { Plus } from 'lucide-react'
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { nodeGroups } from '@/lib/mock/catalog'
import { iso } from '@/lib/mock/util'

const PROTOCOLS: Array<Node['protocol']> = [
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'hysteria2',
  'tuic'
]

const NETWORKS: Array<Node['network']> = ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']

const TLS_MODES: Array<Node['tlsMode']> = ['none', 'tls', 'reality']

interface NodeCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (node: Node) => void
}

export function NodeCreateDialog({ open, onOpenChange, onCreate }: NodeCreateDialogProps) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')
  const [groupId, setGroupId] = useState(nodeGroups[0].id)
  const [protocol, setProtocol] = useState<Node['protocol']>('vless')
  const [network, setNetwork] = useState<Node['network']>('tcp')
  const [tlsMode, setTlsMode] = useState<Node['tlsMode']>('tls')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName('')
    setHost('')
    setPort('443')
    setGroupId(nodeGroups[0].id)
    setProtocol('vless')
    setNetwork('tcp')
    setTlsMode('tls')
    setErrors({})
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Record<string, string> = {}
    const portNumber = Number(port)

    if (!name.trim()) next.name = '请填写节点名称'
    if (!host.trim()) next.host = '请填写接入域名或 IP'
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      next.port = '端口需为 1 - 65535 的整数'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const group = nodeGroups.find((item) => item.id === groupId) ?? nodeGroups[0]
    onCreate({
      id: `node_new_${Date.now()}`,
      name: name.trim(),
      groupId: group.id,
      groupName: group.name,
      protocol,
      host: host.trim(),
      port: portNumber,
      network,
      tlsMode,
      rate: 1,
      status: 'offline',
      onlineUsers: 0,
      cpu: 0,
      memory: 0,
      agentVersion: '待注册',
      core: tlsMode === 'none' ? 'xray' : 'sing-box',
      lastSeenAt: null,
      createdAt: iso(0)
    })
    toast.success('节点已创建，请在节点上执行注册命令')
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建节点</DialogTitle>
          <DialogDescription>
            创建后生成一次性注册令牌，在节点上执行 sparrow-agent register 即可接入。
          </DialogDescription>
        </DialogHeader>
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
              <Field>
                <FieldLabel htmlFor="node-group">节点组</FieldLabel>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger id="node-group" className="w-full">
                    <SelectValue placeholder="选择节点组" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodeGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name} · {group.region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="node-protocol">协议</FieldLabel>
                <Select
                  value={protocol}
                  onValueChange={(value) => setProtocol(value as Node['protocol'])}
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
                  onValueChange={(value) => setNetwork(value as Node['network'])}
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
                  onValueChange={(value) => setTlsMode(value as Node['tlsMode'])}
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
            <Button type="submit">
              <Plus data-icon="inline-start" />
              创建节点
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
