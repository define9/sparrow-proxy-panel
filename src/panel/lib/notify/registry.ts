import 'server-only'
import { createLogProvider } from './log'
import { createResendProvider } from './resend'
import type { MailProvider, MailProviderFactory } from './types'

/**
 * 内置 provider 注册表。
 *
 * 外部插件后续可以通过 registerMailProvider 注册自己的实现，
 * 业务层只认 MailProvider 接口，不需要知道具体是哪一家。
 */

export interface MailProviderRegistration {
  key: string
  name: string
  create: MailProviderFactory
}

const registry = new Map<string, MailProviderRegistration>()

export function registerMailProvider(registration: MailProviderRegistration): () => void {
  registry.set(registration.key, registration)
  return () => {
    if (registry.get(registration.key) === registration) registry.delete(registration.key)
  }
}

export function getMailProviderFactory(key: string): MailProviderFactory | undefined {
  return registry.get(key)?.create
}

export function listMailProviders(): { key: string; name: string }[] {
  return [...registry.values()].map(({ key, name }) => ({ key, name }))
}

// ── 内置注册 ────────────────────────────────────────────────
registerMailProvider({
  key: 'notify-resend',
  name: 'Resend',
  // apiKey 为空视为未配置；from 缺失交给 Resend 返回明确报错
  create: (config) => (config.resend.apiKey ? createResendProvider(config.resend) : null)
})

registerMailProvider({
  key: 'notify-log',
  name: '日志（开发用）',
  create: (): MailProvider => createLogProvider()
})
