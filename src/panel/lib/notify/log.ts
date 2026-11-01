import 'server-only'
import type { MailMessage, MailProvider, MailSendResult } from './types'

/**
 * 内置 provider：本地日志（开发用）。
 * 不投递邮件，只打印结构化日志；生产环境使用会额外告警。
 */

const PREFIX = '[notify:log]'

function slog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>
) {
  const line = `${PREFIX} ${event} ${JSON.stringify(fields)}`
  if (level === 'warn') console.warn(line)
  else if (level === 'error') console.error(line)
  else console.info(line)
}

export function createLogProvider(): MailProvider {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    key: 'notify-log',
    name: '日志（开发用）',
    async send(msg: MailMessage): Promise<MailSendResult> {
      if (isProduction) {
        slog('warn', 'provider.log_in_production', {
          to: msg.to,
          subject: msg.subject,
          hint: '当前使用 notify-log，邮件不会真正投递；请切换 notify-resend'
        })
      } else {
        slog('info', 'mail.send', {
          to: msg.to,
          subject: msg.subject,
          text: msg.text ?? ''
        })
      }
      return { id: 'log' }
    }
  }
}
