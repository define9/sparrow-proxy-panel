import 'server-only'
import type {
  MailMessage,
  MailProvider,
  MailResendConfig,
  MailSendResult
} from './types'

/**
 * 内置 provider：Resend（https://resend.com）。
 * 直接走 HTTP API，不引入 SDK 依赖。
 */

const ENDPOINT = 'https://api.resend.com/emails'

export function createResendProvider(config: MailResendConfig): MailProvider {
  return {
    key: 'notify-resend',
    name: 'Resend',
    async send(msg: MailMessage): Promise<MailSendResult> {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: config.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text
        })
      })

      const body = await response.text()
      if (!response.ok) {
        // 带上响应体，便于在设置页直接看到 Resend 的报错（域名未验证 / key 无效等）
        throw new Error(`Resend HTTP ${response.status}：${body || '空响应'}`)
      }

      try {
        const parsed = JSON.parse(body) as { id?: string }
        return { id: parsed.id }
      } catch {
        return {}
      }
    }
  }
}
