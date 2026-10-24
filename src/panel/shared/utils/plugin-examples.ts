/**
 * 内置示例插件清单。
 *
 * 用途：
 * - 插件管理页「安装示例插件」一键安装，验证 manifest 校验 / 落库 / 启用禁用链路
 * - 单元测试与联调时的最小可用 manifest
 *
 * 该清单同时演示了 configSchema 的 JSON Schema 写法（面板据此自动生成配置表单）。
 */

export interface PluginExampleManifest {
  key: string
  name: string
  version: string
  type: string
  description: string
  author: string
  runtime: string
  permissions: string[]
  hooks: string[]
  configSchema: Record<string, unknown>
}

/** 示例：通知类内置插件 */
export const pluginExampleManifest: PluginExampleManifest = {
  key: 'demo-notifier',
  name: '示例通知插件',
  version: '1.0.0',
  type: 'notify',
  description: '内置示例插件：演示 manifest 校验、hook 调用、配置表单自动生成与启用禁用。',
  author: 'sparrow',
  runtime: 'builtin',
  permissions: ['order:read'],
  hooks: ['notification.send'],
  configSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        title: '通知渠道',
        description: '通知发送渠道',
        default: 'webhook',
        enum: ['webhook', 'email'],
        required: true
      },
      endpoint: {
        type: 'string',
        title: '回调地址',
        description: '接收通知的 HTTP 地址',
        placeholder: 'https://example.com/notify'
      },
      token: {
        type: 'string',
        title: '签名密钥',
        description: '用于请求签名，保存后不再明文回显',
        secret: true
      },
      retry: {
        type: 'integer',
        title: '重试次数',
        default: 3,
        minimum: 0,
        maximum: 10
      },
      enabledHours: {
        type: 'array',
        title: '免打扰时段',
        ui: { widget: 'textarea' }
      }
    },
    required: ['channel']
  }
}
