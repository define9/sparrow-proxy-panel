'use client'

import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { ApiClientError } from '@/lib/api/client'
import {
  useTestMailSettings,
  type MailProvider,
  type MailSettingsDto
} from '@/lib/api/admin'

/** 后端回显的密钥占位符，原样提交表示「不修改」 */
export const MAIL_SECRET_MASK = '••••'

const PROVIDER_LABELS: Record<MailProvider, string> = {
  resend: 'Resend（内置）',
  log: '本地日志'
}

interface MailSettingsFormProps {
  value: MailSettingsDto
  onChange: (value: MailSettingsDto) => void
  disabled?: boolean
}

/** 兼容旧版 smtp 结构，缺字段时补默认值，避免设置页因后端未升级而白屏 */
export function normalizeMailSettings(
  mail: Partial<MailSettingsDto> | null | undefined
): MailSettingsDto {
  const legacy = (mail ?? {}) as Partial<MailSettingsDto> & {
    host?: string
    port?: number
    username?: string
    password?: string
    hasPassword?: boolean
  }

  return {
    provider: mail?.provider === 'log' ? 'log' : 'resend',
    resend: {
      apiKey: mail?.resend?.apiKey ?? '',
      hasApiKey: mail?.resend?.hasApiKey ?? false,
      from: mail?.resend?.from ?? ''
    },
    smtp: {
      host: mail?.smtp?.host ?? legacy.host ?? '',
      port: mail?.smtp?.port ?? legacy.port ?? 465,
      username: mail?.smtp?.username ?? legacy.username ?? '',
      password: mail?.smtp?.password ?? '',
      hasPassword: mail?.smtp?.hasPassword ?? legacy.hasPassword ?? false,
      from: mail?.smtp?.from ?? ''
    },
    testTo: mail?.testTo ?? ''
  }
}

/** 提交前收敛一次，端口等数字字段保证是数字类型 */
export function serializeMailSettings(mail: MailSettingsDto): MailSettingsDto {
  return {
    provider: mail.provider === 'log' ? 'log' : 'resend',
    resend: {
      apiKey: mail.resend.apiKey,
      hasApiKey: mail.resend.hasApiKey,
      from: mail.resend.from
    },
    smtp: {
      host: mail.smtp.host,
      port: Number(mail.smtp.port) || 465,
      username: mail.smtp.username,
      password: mail.smtp.password,
      hasPassword: mail.smtp.hasPassword,
      from: mail.smtp.from
    },
    testTo: mail.testTo.trim()
  }
}

export function MailSettingsForm({ value, onChange, disabled = false }: MailSettingsFormProps) {
  const testMail = useTestMailSettings()

  function patch(next: Partial<MailSettingsDto>) {
    onChange({ ...value, ...next })
  }

  function handleTest() {
    const to = value.testTo.trim()
    if (!to) {
      toast.error('请先填写测试收件人')
      return
    }

    testMail.mutate(to, {
      onSuccess: (result) => {
        toast.success('测试邮件已发送', {
          description: `已通过 ${PROVIDER_LABELS[result.provider] ?? result.provider} 发送至 ${to}`
        })
      },
      onError: (error) => {
        if (error instanceof ApiClientError) {
          toast.error(
            error.code === 'MAIL_NOT_CONFIGURED' ? '邮件未配置' : '测试邮件发送失败',
            { description: error.message }
          )
          return
        }
        toast.error('测试邮件发送失败', { description: '请稍后重试' })
      }
    })
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="mail-provider">发送方式</FieldLabel>
        <Select
          value={value.provider}
          disabled={disabled}
          onValueChange={(next) => patch({ provider: next as MailProvider })}
        >
          <SelectTrigger id="mail-provider" className="w-full sm:w-72">
            <SelectValue placeholder="选择邮件发送方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resend">{PROVIDER_LABELS.resend}</SelectItem>
            <SelectItem value="log">{PROVIDER_LABELS.log}</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>
          注册验证码、找回密码等邮件都走这里；切换后记得保存。
        </FieldDescription>
      </Field>

      {value.provider === 'resend' ? (
        <>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="mail-resend-api-key">API Key</FieldLabel>
              {value.resend.hasApiKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => patch({ resend: { ...value.resend, apiKey: '' } })}
                >
                  清空重填
                </Button>
              ) : null}
            </div>
            <Input
              id="mail-resend-api-key"
              type="password"
              autoComplete="new-password"
              className="font-mono"
              placeholder={value.resend.hasApiKey ? MAIL_SECRET_MASK : 're_xxxxxxxx'}
              value={value.resend.apiKey}
              disabled={disabled}
              onChange={(event) =>
                patch({ resend: { ...value.resend, apiKey: event.target.value } })
              }
            />
            <FieldDescription>
              {value.resend.hasApiKey
                ? '已保存，保持占位符不变即不修改；需要换密钥时点「清空重填」。'
                : '在 Resend 控制台创建 API Key 后填入。'}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="mail-resend-from">发件人</FieldLabel>
            <Input
              id="mail-resend-from"
              placeholder="Sparrow <noreply@your-domain.com>"
              value={value.resend.from}
              disabled={disabled}
              onChange={(event) =>
                patch({ resend: { ...value.resend, from: event.target.value } })
              }
            />
            <FieldDescription>域名需要在 Resend 完成验证，否则会被拒收。</FieldDescription>
          </Field>
        </>
      ) : (
        <Field>
          <FieldDescription>
            邮件内容会打到容器日志，可用 <code className="font-mono">docker compose logs panel</code> 查看验证码。
          </FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="mail-test-to">测试收件人</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="mail-test-to"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={value.testTo}
            disabled={disabled}
            onChange={(event) => patch({ testTo: event.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={disabled || testMail.isPending}
            onClick={handleTest}
          >
            <Send data-icon="inline-start" />
            {testMail.isPending ? '发送中…' : '发送测试邮件'}
          </Button>
        </div>
        <FieldDescription>仅用于验证当前配置，不会保存任何内容。</FieldDescription>
      </Field>
    </FieldGroup>
  )
}
