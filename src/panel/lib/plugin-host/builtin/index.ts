import type { BuiltinPlugin, PluginType } from '../types'
import { paymentEpay } from './payment-epay'
import { paymentStripe } from './payment-stripe'

/**
 * 内置插件注册表（纯声明，无数据访问）。
 *
 * 新增内置插件只要在这里追加一条；写库由 ../registry.ts 的
 * ensureBuiltinPlugins() 负责，幂等 upsert 不覆盖管理员改过的 config / status。
 */
export const builtinPlugins: BuiltinPlugin[] = [paymentEpay, paymentStripe]

export function findBuiltinPlugin(key: string): BuiltinPlugin | undefined {
  return builtinPlugins.find((plugin) => plugin.key === key)
}

export function builtinPluginsOfType(type: PluginType): BuiltinPlugin[] {
  return builtinPlugins.filter((plugin) => plugin.type === type)
}
