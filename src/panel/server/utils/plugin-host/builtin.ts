import type { PluginHookHost } from './hooks'

/**
 * 内置插件实现注册。
 *
 * 内置插件（runtime=builtin）跑在面板进程内，实现以代码形式注册。
 * 第三方插件一律走外置进程（runtime=external）。
 *
 * 这里只放示例实现，真实内置插件（如易支付）由各自模块注册。
 */

/** 示例通知插件的实现（对应 shared/utils/plugin-examples.ts 的 demo-notifier） */
export function registerBuiltinPluginHooks(host: PluginHookHost): void {
  host.register('notification.send', {
    pluginKey: 'demo-notifier',
    handler: async (payload) => {
      console.info('[plugin:demo-notifier] 收到通知：', JSON.stringify(payload))
      return { delivered: true }
    }
  })
}
