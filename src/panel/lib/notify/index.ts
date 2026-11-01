import 'server-only'
import { ApiError } from '@/lib/api/response'
import { getMailConfig } from '@/lib/services/settings'
import { getMailProviderFactory } from './registry'
import type {
  MailConfig,
  MailMessage,
  MailProvider,
  MailSendResult
} from './types'

export type {
  MailConfig,
  MailMessage,
  MailProvider,
  MailProviderFactory,
  MailProviderKind,
  MailResendConfig,
  MailSendResult,
  MailSmtpConfig
} from './types'
export { listMailProviders, registerMailProvider } from './registry'
export type { MailProviderRegistration } from './registry'
export { MASK, mergeMailConfig, normalizeMailConfig, toMailSettingsView } from './config'

/** settings.mail.provider → provider key */
export function providerKeyFor(kind: MailConfig['provider']): string {
  return kind === 'log' ? 'notify-log' : 'notify-resend'
}

/** 读 settings 解析当前 provider；配置不完整时返回 null */
export async function resolveMailProvider(): Promise<MailProvider | null> {
  const config = await getMailConfig()
  const factory = getMailProviderFactory(providerKeyFor(config.provider))
  return factory ? factory(config) : null
}

/**
 * 发送邮件。未配置 provider 时抛 422 MAIL_NOT_CONFIGURED，
 * provider 报错统一包装成 502 MAIL_SEND_FAILED（保留上游响应体）。
 * 已解析出 provider 的调用方可以传第二个参数避免重复读库。
 */
export async function sendMail(
  msg: MailMessage,
  provider?: MailProvider | null
): Promise<MailSendResult> {
  const active = provider === undefined ? await resolveMailProvider() : provider
  if (!active) {
    throw new ApiError(422, 'MAIL_NOT_CONFIGURED', '邮件服务未配置，请先在系统设置中填写邮件服务商')
  }

  try {
    return await active.send(msg)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new ApiError(502, 'MAIL_SEND_FAILED', `邮件发送失败（${active.key}）：${detail}`, {
      provider: active.key,
      detail
    })
  }
}
