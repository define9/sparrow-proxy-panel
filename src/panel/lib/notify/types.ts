/**
 * 邮件 provider 契约。
 *
 * 内置实现在 lib/notify/{resend,log}.ts，外部插件只要实现同一个
 * MailProvider 接口并注册到注册表即可替换，业务代码无需改动。
 */

export interface MailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export interface MailSendResult {
  id?: string
}

export interface MailProvider {
  /** 唯一标识：notify-resend | notify-log */
  key: string
  /** 展示名 */
  name: string
  send(msg: MailMessage): Promise<MailSendResult>
}

/** 设置里选择的 provider 类型（settings.mail.provider） */
export type MailProviderKind = 'resend' | 'log'

export interface MailResendConfig {
  apiKey: string
  from: string
}

export interface MailSmtpConfig {
  host: string
  port: number
  username: string
  password: string
  from: string
}

export interface MailConfig {
  provider: MailProviderKind
  resend: MailResendConfig
  smtp: MailSmtpConfig
  testTo: string
}

/** provider 工厂：配置不完整时返回 null，表示「未配置」 */
export type MailProviderFactory = (config: MailConfig) => MailProvider | null
