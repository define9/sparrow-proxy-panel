import { registerBuiltinPluginHooks } from './builtin'
import { PluginHookHost } from './hooks'
import type { HookCallOptions, HookCallResult } from './hooks'
import { listHookTargets, writePluginEvent } from './store'

/**
 * 插件宿主运行时（生产装配）。
 *
 * - store：从 plugins 表取出声明了该 hook 且状态为 installed 的插件
 * - sink：把每次调用写进 plugin_events
 */

let _host: PluginHookHost | undefined

/** 取得全局插件宿主（单例） */
export function getPluginHost(): PluginHookHost {
  if (!_host) {
    _host = new PluginHookHost({
      store: { list: listHookTargets },
      sink: { record: writePluginEvent }
    })
    registerBuiltinPluginHooks(_host)
  }

  return _host
}

/**
 * 调用 hook。
 *
 * 内置插件同步 await；外置插件失败只记录事件，不阻塞主流程。
 */
export async function callHook(
  hook: string,
  payload: unknown,
  options: HookCallOptions = {}
): Promise<HookCallResult> {
  return getPluginHost().callHook(hook, payload, options)
}
