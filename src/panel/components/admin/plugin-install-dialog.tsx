'use client'

import { useState } from 'react'
import { GitBranch, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useInstallPlugin, type PluginType } from '@/lib/api/admin'

const pluginTypeLabels: Record<PluginType, string> = {
  payment: '支付',
  node_source: '节点源',
  subscription: '订阅',
  notify: '通知',
  hook: '钩子',
  ui: '界面'
}

interface PluginPreview {
  key: string
  name: string
  version: string
  type: PluginType
  permissions: string[]
  egress: string[]
  hooks: string[]
  signed: boolean
  compatibility: string
  commitSha: string
}

const EXAMPLE_URL = 'https://github.com/foo/sparrow-plugin-epay#v1.2.0'

function buildPreview(repoUrl: string): PluginPreview {
  const cleaned = repoUrl.replace(/^https?:\/\/github\.com\//, '')
  const repo = cleaned.split(/[?#]/)[0]
  const ref = repoUrl.match(/#v?([\w.-]+)/)?.[1] ?? 'HEAD'
  const repoName = repo.split('/')[1] ?? 'sparrow-plugin-demo'
  const key = repoName.replace(/^sparrow-plugin-/, '')
  const permissions = ['order:read', 'order:write', 'settings:read']
  const unsigned = !repoUrl.includes('sparrow-labs')

  return {
    key,
    name: `社区插件 ${key}`,
    version: /^\d+\.\d+\.\d+$/.test(ref) ? ref : '0.1.0',
    type: key.includes('pay') ? 'payment' : key.includes('notify') ? 'notify' : 'hook',
    permissions,
    egress: ['api.example.com', 'api.epay.example.com'],
    hooks: ['order.created', 'order.paid'],
    signed: !unsigned,
    compatibility: '>=0.1.0 <1.0.0',
    commitSha: 'c0ffee1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e'
  }
}

interface PluginInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PluginInstallDialog({ open, onOpenChange }: PluginInstallDialogProps) {
  const [step, setStep] = useState<'url' | 'preview'>('url')
  const [repoUrl, setRepoUrl] = useState('')
  const [preview, setPreview] = useState<PluginPreview | null>(null)
  const [granted, setGranted] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const install = useInstallPlugin()

  const urlError =
    repoUrl.trim() && !/^https:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+(?:[?#].*)?$/.test(repoUrl.trim())
      ? '只支持 https 形式的仓库地址，例如 https://github.com/foo/sparrow-plugin-epay'
      : undefined

  function reset() {
    setStep('url')
    setRepoUrl('')
    setPreview(null)
    setGranted([])
    setConfirmed(false)
    setSubmitting(false)
    setServerError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handlePreview() {
    if (urlError || !repoUrl.trim()) return
    const next = buildPreview(repoUrl.trim())
    setPreview(next)
    setGranted(next.permissions)
    setConfirmed(false)
    setServerError(null)
    setStep('preview')
  }

  async function handleInstall() {
    if (!preview) return
    setSubmitting(true)
    setServerError(null)
    try {
      await install.mutateAsync({ repoUrl: repoUrl.trim() })
      toast.success(`已提交安装任务：${preview.key}@${preview.version}`)
      handleOpenChange(false)
    } catch (error) {
      setServerError((error as Error).message)
      toast.error((error as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const allGranted = preview ? granted.length === preview.permissions.length : false
  const canInstall = Boolean(preview) && allGranted && (!preview?.signed ? confirmed : true)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>安装插件</DialogTitle>
          <DialogDescription>
            {step === 'url' ? '粘贴社区插件的 Git 仓库地址，先预览 manifest 再安装。' : '确认申请的权限与出网域名后开始安装。'}
          </DialogDescription>
        </DialogHeader>

        {step === 'url' ? (
          <FieldGroup>
            <Field data-invalid={Boolean(urlError)}>
              <FieldLabel htmlFor="plugin-repo-url">Git 仓库地址</FieldLabel>
              <Input
                id="plugin-repo-url"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder={EXAMPLE_URL}
                aria-invalid={Boolean(urlError)}
              />
              {urlError ? <FieldError>{urlError}</FieldError> : null}
              <FieldDescription>
                支持 <code className="font-mono">#tag</code> / <code className="font-mono">#commit</code> 与{' '}
                <code className="font-mono">?subdir=</code>；安装后会固定到解析出的 commit sha。
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handlePreview} disabled={!repoUrl.trim() || Boolean(urlError)}>
                <GitBranch data-icon="inline-start" />
                预览
              </Button>
            </DialogFooter>
          </FieldGroup>
        ) : null}

        {step === 'preview' && preview ? (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{preview.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {preview.key}@{preview.version} · {preview.commitSha.slice(0, 7)}
                  </span>
                </div>
                {preview.signed ? <Badge variant="success">签名已验证</Badge> : <Badge variant="warning">未签名</Badge>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">插件类型</span>
                  <span className="text-sm">{pluginTypeLabels[preview.type]}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">兼容性</span>
                  <span className="font-mono text-sm">{preview.compatibility}</span>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">申请权限</span>
                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox
                      id="permission-all"
                      checked={allGranted}
                      onCheckedChange={(checked) => setGranted(checked === true ? preview.permissions : [])}
                    />
                    <FieldLabel htmlFor="permission-all">全选</FieldLabel>
                  </Field>
                </div>
                <div className="flex flex-col gap-2">
                  {preview.permissions.map((permission) => (
                    <Field key={permission} orientation="horizontal">
                      <Checkbox
                        id={`permission-${permission}`}
                        checked={granted.includes(permission)}
                        onCheckedChange={(checked) =>
                          setGranted((current) =>
                            checked === true
                              ? [...new Set([...current, permission])]
                              : current.filter((item) => item !== permission)
                          )
                        }
                      />
                      <FieldLabel htmlFor={`permission-${permission}`} className="font-mono text-xs">
                        {permission}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">出网域名（egress）</span>
                <div className="flex flex-wrap gap-2">
                  {preview.egress.map((host) => (
                    <Badge key={host} variant="outline" className="font-mono">
                      {host}
                    </Badge>
                  ))}
                </div>
              </div>

              {preview.signed ? null : (
                <Alert variant="destructive">
                  <ShieldAlert data-icon="inline-start" />
                  <AlertTitle>未签名的社区插件</AlertTitle>
                  <AlertDescription>
                    无法验证作者身份，插件将以最小权限运行。请确认仓库来源可信后再安装。
                  </AlertDescription>
                </Alert>
              )}

              {preview.signed ? null : (
                <Field orientation="horizontal">
                  <Checkbox
                    id="plugin-unsigned-confirm"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <FieldLabel htmlFor="plugin-unsigned-confirm">我已确认来源可信，继续安装未签名插件</FieldLabel>
                </Field>
              )}
            </div>

            {serverError ? (
              <Alert variant="destructive">
                <ShieldAlert data-icon="inline-start" />
                <AlertTitle>安装未执行</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('url')} disabled={submitting}>
                上一步
              </Button>
              <Button disabled={!canInstall || submitting} onClick={handleInstall}>
                {submitting ? '提交中…' : '确认安装'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
