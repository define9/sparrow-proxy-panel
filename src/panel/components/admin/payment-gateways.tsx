'use client'

import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  CreditCard,
  ExternalLink,
  FlaskConical,
  Loader2,
  Save,
  Star,
  Undo2
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiClientError, apiFetch } from '@/lib/api/client'

/* ------------------------------------------------------------------ 契约 */

export type PaymentFieldType = 'text' | 'password' | 'url' | 'select'

export interface PaymentFieldOption {
  label: string
  value: string
}

export interface PaymentGatewayField {
  key: string
  label: string
  type: PaymentFieldType
  required?: boolean
  placeholder?: string
  help?: string
  /** 敏感字段，后端回显为 MASK，原样提交表示「不修改」 */
  secret?: boolean
  options?: PaymentFieldOption[]
}

export interface PaymentGatewayMethod {
  label: string
  value: string
}

export interface PaymentGatewayDto {
  key: string
  name: string
  description?: string
  docsUrl?: string
  enabled: boolean
  hasSecret?: boolean
  methods?: PaymentGatewayMethod[]
  fields: PaymentGatewayField[]
  config: Record<string, string>
}

export interface PaymentGatewaysDto {
  default: string
  gateways: PaymentGatewayDto[]
}

export interface PaymentCheckDto {
  name: string
  ok: boolean
  detail?: string
}

export interface PaymentTestResultDto {
  ok: boolean
  checks: PaymentCheckDto[]
}

/** 后端回显的密钥占位符，原样提交表示「不修改」 */
export const PAYMENT_SECRET_MASK = '••••'

const GATEWAYS_PATH = '/api/v1/admin/payment/gateways'
const GATEWAYS_KEY = ['payment-gateways'] as const

/* ------------------------------------------------------------------ 数据 */

function usePaymentGateways() {
  return useQuery({
    queryKey: GATEWAYS_KEY,
    queryFn: () => apiFetch<PaymentGatewaysDto>(GATEWAYS_PATH),
    retry: (failureCount, error) =>
      !(error instanceof ApiClientError && error.statusCode === 404) && failureCount < 2
  })
}

function useUpdatePaymentGateway() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      body
    }: {
      key: string
      body: { enabled?: boolean; config?: Record<string, string> }
    }) =>
      apiFetch<PaymentGatewayDto>(`${GATEWAYS_PATH}/${key}`, {
        method: 'PUT',
        body
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GATEWAYS_KEY })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

function useTestPaymentGateway() {
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<PaymentTestResultDto>(`${GATEWAYS_PATH}/${key}/test`, {
        method: 'POST'
      })
  })
}

function useSetDefaultPaymentGateway() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<PaymentGatewaysDto>('/api/v1/admin/payment/default', {
        method: 'PUT',
        body: { key }
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GATEWAYS_KEY })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

/** 后端接口未合并前的本地示例数据，仅用于界面预览 */
const PREVIEW_GATEWAYS: PaymentGatewaysDto = {
  default: 'epay',
  gateways: [
    {
      key: 'epay',
      name: '易支付',
      description: '聚合支付网关，支持支付宝、微信等常用通道',
      docsUrl: 'https://pay.example.com/doc',
      enabled: true,
      hasSecret: true,
      methods: [
        { label: '支付宝', value: 'alipay' },
        { label: '微信', value: 'wxpay' }
      ],
      fields: [
        {
          key: 'apiUrl',
          label: '网关地址',
          type: 'url',
          required: true,
          placeholder: 'https://pay.example.com'
        },
        {
          key: 'pid',
          label: '商户 ID (PID)',
          type: 'text',
          required: true,
          help: '易支付后台 → 商户信息'
        },
        {
          key: 'key',
          label: '商户密钥',
          type: 'password',
          required: true,
          secret: true
        },
        {
          key: 'channel',
          label: '默认支付方式',
          type: 'select',
          options: [
            { label: '支付宝', value: 'alipay' },
            { label: '微信', value: 'wxpay' }
          ]
        },
        {
          key: 'notifyUrl',
          label: '异步回调地址',
          type: 'url',
          help: '留空使用默认值'
        },
        { key: 'returnUrl', label: '同步跳转地址', type: 'url' }
      ],
      config: {
        apiUrl: '',
        pid: '',
        key: PAYMENT_SECRET_MASK,
        channel: 'alipay',
        notifyUrl: '',
        returnUrl: ''
      }
    },
    {
      key: 'stripe',
      name: 'Stripe',
      description: '国际信用卡渠道，支持一次性支付与订阅',
      docsUrl: 'https://docs.stripe.com/keys',
      enabled: false,
      hasSecret: true,
      methods: [{ label: '信用卡', value: 'card' }],
      fields: [
        {
          key: 'secretKey',
          label: 'Secret Key',
          type: 'password',
          required: true,
          secret: true
        },
        {
          key: 'publishableKey',
          label: 'Publishable Key',
          type: 'text',
          required: true,
          placeholder: 'pk_live_...'
        },
        {
          key: 'currency',
          label: '结算货币',
          type: 'select',
          options: [
            { label: '美元 (USD)', value: 'usd' },
            { label: '人民币 (CNY)', value: 'cny' }
          ]
        }
      ],
      config: {
        secretKey: PAYMENT_SECRET_MASK,
        publishableKey: '',
        currency: 'usd'
      }
    }
  ]
}

/* ------------------------------------------------------------------ 页面 */

export function PaymentGateways() {
  const { data, isLoading, isError, error, refetch, isFetching } = usePaymentGateways()

  const notMerged = error instanceof ApiClientError && error.statusCode === 404
  const preview = notMerged
  const source = preview ? PREVIEW_GATEWAYS : data

  if (isLoading) {
    return (
      <div className="grid max-w-3xl gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!source) {
    return (
      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-destructive">
          加载失败：{isError ? (error as Error).message : '支付渠道数据为空'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="grid max-w-3xl gap-4">
      {preview ? (
        <Alert>
          <CircleAlert />
          <AlertTitle>支付渠道接口未就绪</AlertTitle>
          <AlertDescription>
            当前后端未返回渠道配置（404），下面展示的是本地示例数据，仅供界面预览，暂不会保存。待后端合并后即可直接联调。
          </AlertDescription>
        </Alert>
      ) : null}

      {source.gateways.length === 0 ? (
        <p className="text-sm text-muted-foreground">后端暂未返回任何支付渠道。</p>
      ) : (
        source.gateways.map((gateway) => (
          <GatewayCard
            key={gateway.key}
            gateway={gateway}
            isDefault={gateway.key === source.default}
            preview={preview}
            defaultExpanded={gateway.key === source.default}
          />
        ))
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 单个渠道 */

function GatewayCard({
  gateway,
  isDefault,
  preview,
  defaultExpanded
}: {
  gateway: PaymentGatewayDto
  isDefault: boolean
  preview: boolean
  defaultExpanded: boolean
}) {
  const update = useUpdatePaymentGateway()
  const test = useTestPaymentGateway()
  const setDefault = useSetDefaultPaymentGateway()

  const [expanded, setExpanded] = useState(defaultExpanded)
  const [enabled, setEnabled] = useState(gateway.enabled)
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...gateway.config }))
  /** 用户点了「重填」的密钥字段：清空占位，等待输入新值 */
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<PaymentTestResultDto | null>(null)

  const pending = update.isPending || setDefault.isPending
  const busy = pending || preview

  const missing = gateway.fields.filter((field) => {
    if (!field.required) return false
    const value = (draft[field.key] ?? '').trim()
    return value === '' || value === PAYMENT_SECRET_MASK
  })
  const canSave = !busy && missing.length === 0

  function patchField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleToggleEnabled(next: boolean) {
    setEnabled(next)

    if (preview) {
      toast.info('支付渠道接口未就绪，暂不能保存开关')
      return
    }

    update.mutate(
      { key: gateway.key, body: { enabled: next } },
      {
        onSuccess: (saved) => {
          setEnabled(saved.enabled)
          toast.success(next ? `${gateway.name}已启用` : `${gateway.name}已停用`)
        },
        onError: (mutationError) => {
          setEnabled(!next)
          toast.error('切换失败', { description: mutationError.message })
        }
      }
    )
  }

  function handleSave() {
    if (preview) {
      toast.info('支付渠道接口未就绪，暂不能保存')
      return
    }

    if (missing.length > 0) {
      toast.error('请先填写必填字段', {
        description: missing.map((field) => field.label).join('、')
      })
      setExpanded(true)
      return
    }

    update.mutate(
      { key: gateway.key, body: { config: draft } },
      {
        onSuccess: (saved) => {
          setDraft({ ...saved.config })
          setRevealed({})
          setEnabled(saved.enabled)
          toast.success(`${gateway.name}配置已保存`)
        },
        onError: (mutationError) => {
          toast.error('保存失败', { description: mutationError.message })
        }
      }
    )
  }

  function handleTest() {
    if (preview) {
      toast.info('支付渠道接口未就绪，暂不能测试连接')
      return
    }

    setTestResult(null)
    test.mutate(gateway.key, {
      onSuccess: (result) => {
        setTestResult(result)
        if (result.ok) toast.success('连接测试通过')
        else toast.error('连接测试未通过', { description: '请查看下方检查项' })
      },
      onError: (mutationError) => {
        toast.error('连接测试失败', { description: mutationError.message })
      }
    })
  }

  function handleSetDefault() {
    if (preview) {
      toast.info('支付渠道接口未就绪，暂不能设置默认渠道')
      return
    }

    setDefault.mutate(gateway.key, {
      onSuccess: () => toast.success(`已将${gateway.name}设为默认渠道`),
      onError: (mutationError) => {
        toast.error('设置默认渠道失败', { description: mutationError.message })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CreditCard data-icon="inline-start" className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{gateway.name}</CardTitle>
            <Badge variant="outline" className="font-mono text-[11px]">
              {gateway.key}
            </Badge>
            {isDefault ? (
              <Badge variant="success">
                <Star data-icon="inline-start" />
                默认渠道
              </Badge>
            ) : (
              <Button variant="ghost" size="xs" disabled={busy} onClick={handleSetDefault}>
                <Star data-icon="inline-start" />
                设为默认
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`gateway-enabled-${gateway.key}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Switch
                id={`gateway-enabled-${gateway.key}`}
                checked={enabled}
                disabled={busy}
                onCheckedChange={handleToggleEnabled}
              />
              启用
            </label>
            <Button
              variant="outline"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                data-icon="inline-start"
                className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
              {expanded ? '收起' : '配置'}
            </Button>
          </div>
        </div>

        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {gateway.description ? <span>{gateway.description}</span> : null}
          {gateway.methods?.length ? (
            <span className="flex flex-wrap items-center gap-1">
              {gateway.methods.map((method) => (
                <Badge key={method.value} variant="secondary">
                  {method.label}
                </Badge>
              ))}
            </span>
          ) : null}
          {gateway.docsUrl ? (
            <a
              href={gateway.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
            >
              文档
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </CardDescription>
      </CardHeader>

      {expanded ? (
        <>
          <CardContent>
            <FieldGroup>
              {gateway.fields.map((field) => (
                <GatewayFieldControl
                  key={field.key}
                  gatewayKey={gateway.key}
                  field={field}
                  value={draft[field.key] ?? ''}
                  revealed={Boolean(revealed[field.key])}
                  disabled={update.isPending}
                  onChange={(value) => patchField(field.key, value)}
                  onReveal={() => {
                    setRevealed((current) => ({ ...current, [field.key]: true }))
                    patchField(field.key, '')
                  }}
                  onReset={() => {
                    setRevealed((current) => ({ ...current, [field.key]: false }))
                    patchField(field.key, PAYMENT_SECRET_MASK)
                  }}
                />
              ))}
            </FieldGroup>
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-3">
            {testResult ? <TestResultAlert result={testResult} /> : null}

            {missing.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                待填写必填项：{missing.map((field) => field.label).join('、')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" disabled={busy || test.isPending} onClick={handleTest}>
                {test.isPending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <FlaskConical data-icon="inline-start" />
                )}
                {test.isPending ? '测试中…' : '测试连接'}
              </Button>
              <Button disabled={!canSave} onClick={handleSave}>
                {update.isPending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {update.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </CardFooter>
        </>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ 动态字段 */

function GatewayFieldControl({
  gatewayKey,
  field,
  value,
  revealed,
  disabled,
  onChange,
  onReveal,
  onReset
}: {
  gatewayKey: string
  field: PaymentGatewayField
  value: string
  revealed: boolean
  disabled: boolean
  onChange: (value: string) => void
  onReveal: () => void
  onReset: () => void
}) {
  const generatedId = useId()
  const id = `gateway-${gatewayKey}-${field.key}-${generatedId}`
  const isSecret = field.type === 'password' || field.secret === true
  const masked = isSecret && value === PAYMENT_SECRET_MASK

  const label = (
    <FieldLabel htmlFor={id}>
      {field.label}
      {field.required ? (
        <>
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only">（必填）</span>
        </>
      ) : null}
    </FieldLabel>
  )

  const describedBy = field.help || (isSecret && masked) ? `${id}-help` : undefined

  if (field.type === 'select') {
    return (
      <Field>
        {label}
        <Select value={value} disabled={disabled} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full sm:w-72" aria-describedby={describedBy}>
            <SelectValue placeholder={field.placeholder ?? '请选择'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help ? (
          <FieldDescription id={`${id}-help`}>{field.help}</FieldDescription>
        ) : null}
      </Field>
    )
  }

  if (isSecret) {
    return (
      <Field>
        <div className="flex items-center justify-between gap-2">
          {label}
          {masked ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={onReveal}
            >
              重填
            </Button>
          ) : revealed ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={onReset}
            >
              <Undo2 data-icon="inline-start" />
              撤销
            </Button>
          ) : null}
        </div>
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          className="font-mono"
          placeholder={masked ? PAYMENT_SECRET_MASK : (field.placeholder ?? '请输入新的密钥')}
          value={masked ? '' : value}
          readOnly={masked}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldDescription id={`${id}-help`}>
          {masked
            ? '已保存，保持占位不变即视为不修改；需要换密钥时点「重填」。'
            : (field.help ?? '填写后将覆盖已保存的值。')}
        </FieldDescription>
      </Field>
    )
  }

  return (
    <Field>
      {label}
      <Input
        id={id}
        type={field.type === 'url' ? 'url' : 'text'}
        className={field.type === 'url' ? 'font-mono' : undefined}
        placeholder={field.placeholder}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.help ? <FieldDescription id={`${id}-help`}>{field.help}</FieldDescription> : null}
    </Field>
  )
}

/* ------------------------------------------------------------------ 测试结果 */

function TestResultAlert({ result }: { result: PaymentTestResultDto }) {
  return (
    <Alert variant={result.ok ? 'default' : 'destructive'}>
      {result.ok ? <CircleCheck /> : <CircleX />}
      <AlertTitle>{result.ok ? '连接测试通过' : '连接测试未通过'}</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {result.checks.map((check) => (
            <li
              key={check.name}
              className={
                check.ok
                  ? 'flex items-start gap-1.5'
                  : 'flex items-start gap-1.5 text-destructive'
              }
            >
              {check.ok ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <CircleX className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>
                <span className="font-medium">{check.name}</span>
                {check.detail ? (
                  <span className={check.ok ? 'text-muted-foreground' : undefined}>
                    {' '}
                    · {check.detail}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
