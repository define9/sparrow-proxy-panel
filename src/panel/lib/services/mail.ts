import 'server-only'
import { ApiError } from '@/lib/api/response'
import { resolveMailProvider, sendMail, type MailMessage, type MailProvider } from '@/lib/notify'

/**
 * 邮件业务层：模板组装 + 测试发送。
 * provider 的解析与 HTTP 调用在 lib/notify 里，这里只关心「发什么」。
 */

const TTL_MINUTES = 10

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
    <div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:600">${title}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:12px;color:#71717a">此邮件由系统自动发送，请勿直接回复。</p>
    </div>
  </body>
</html>`
}

function codeBlock(code: string) {
  return `<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>`
}

export function buildLoginCodeMessage(to: string, code: string): MailMessage {
  return {
    to,
    subject: '登录验证码',
    html: layout(
      '登录验证码',
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">你正在登录 Sparrow 面板，验证码为：</p>
       ${codeBlock(code)}
       <p style="margin:0;font-size:14px;line-height:1.6">验证码 ${TTL_MINUTES} 分钟内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。</p>`
    ),
    text: `登录验证码：${code}\n验证码 ${TTL_MINUTES} 分钟内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。`
  }
}

export function buildResetCodeMessage(to: string, code: string): MailMessage {
  return {
    to,
    subject: '重置密码验证码',
    html: layout(
      '重置密码验证码',
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">你正在重置 Sparrow 面板的登录密码，验证码为：</p>
       ${codeBlock(code)}
       <p style="margin:0;font-size:14px;line-height:1.6">验证码 ${TTL_MINUTES} 分钟内有效。若非本人操作，请忽略本邮件，你的密码不会改变。</p>`
    ),
    text: `重置密码验证码：${code}\n验证码 ${TTL_MINUTES} 分钟内有效。若非本人操作，请忽略本邮件，你的密码不会改变。`
  }
}

/** log 或未配置时允许把 devCode 回给前端，方便本地联调 */
export function exposesDevCode(provider: MailProvider | null): boolean {
  return !provider || provider.key === 'notify-log'
}

/** 管理端「发送测试邮件」：必须已配置 provider，否则 422 */
export async function sendTestMail(to: string) {
  const provider = await resolveMailProvider()
  if (!provider) {
    throw new ApiError(422, 'MAIL_NOT_CONFIGURED', '邮件服务未配置，请先填写 Resend API Key 或切换为日志模式')
  }

  const result = await sendMail(
    {
      to,
      subject: 'Sparrow 测试邮件',
      html: layout(
        '测试邮件',
        `<p style="margin:0;font-size:14px;line-height:1.6">如果你收到这封邮件，说明当前邮件服务（${provider.name}）配置可用。</p>`
      ),
      text: `测试邮件：当前邮件服务（${provider.name}）配置可用。`
    },
    provider
  )

  return { ok: true as const, provider: provider.key, id: result.id }
}
