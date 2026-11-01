import type { GatewayDefinition } from './types'

/**
 * 内置支付渠道注册表（纯声明，无数据访问）。
 *
 * 与 lib/notify/registry.ts 同一套思路：业务层只认 GatewayDefinition，
 * 新增渠道只要在这里追加一条声明即可。
 */

const EPAY: GatewayDefinition = {
  key: 'epay',
  name: '易支付',
  description: '聚合支付网关（支付宝 / 微信 / QQ），按易支付标准参数对接。',
  docsUrl: 'https://pay.example.com/doc',
  fields: [
    {
      key: 'apiUrl',
      label: '网关地址',
      type: 'url',
      placeholder: 'https://pay.example.com',
      help: '易支付站点根地址，不带 /submit.php',
      required: true
    },
    {
      key: 'pid',
      label: '商户 ID (PID)',
      type: 'text',
      placeholder: '1001',
      help: '易支付后台的商户 ID',
      required: true
    },
    {
      key: 'key',
      label: '商户密钥',
      type: 'password',
      placeholder: '商户密钥',
      help: '用于签名校验，只保存在服务端',
      required: true,
      secret: true
    },
    {
      key: 'channel',
      label: '默认支付方式',
      type: 'select',
      help: '下单时默认选中的支付方式',
      options: [
        { label: '支付宝', value: 'alipay' },
        { label: '微信', value: 'wxpay' },
        { label: 'QQ', value: 'qqpay' }
      ]
    },
    {
      key: 'notifyUrl',
      label: '异步回调地址',
      type: 'url',
      placeholder: '留空使用站点默认地址',
      help: '留空则用 NEXT_PUBLIC_SITE_URL/api/v1/pay/epay/callback'
    },
    {
      key: 'returnUrl',
      label: '同步跳转地址',
      type: 'url',
      placeholder: '留空使用站点默认地址',
      help: '留空则用 NEXT_PUBLIC_SITE_URL/dashboard/orders'
    }
  ],
  methods: [
    { label: '支付宝', value: 'alipay' },
    { label: '微信', value: 'wxpay' },
    { label: 'QQ', value: 'qqpay' }
  ]
}

const STRIPE: GatewayDefinition = {
  key: 'stripe',
  name: 'Stripe',
  description: '国际信用卡渠道，当前仅保存配置，尚未实现真实对接。',
  docsUrl: 'https://docs.stripe.com/keys',
  fields: [
    {
      key: 'publishableKey',
      label: 'Publishable Key',
      type: 'text',
      placeholder: 'pk_live_...',
      required: true
    },
    {
      key: 'secretKey',
      label: 'Secret Key',
      type: 'password',
      placeholder: 'sk_live_...',
      required: true,
      secret: true
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret',
      type: 'password',
      placeholder: 'whsec_...',
      help: 'Stripe 后台 Webhook 签名密钥',
      secret: true
    }
  ],
  methods: [{ label: '信用卡', value: 'card' }]
}

const DEFINITIONS: GatewayDefinition[] = [EPAY, STRIPE]

/** 新装站点 / 旧结构缺失时的默认启用状态 */
const DEFAULT_ENABLED: Record<string, boolean> = { epay: true, stripe: false }

/** 已经实现真实下单链路的渠道；其余只保存配置 */
const IMPLEMENTED: Record<string, boolean> = { epay: true }

const DEFAULT_GATEWAY_KEY = 'epay'

export function listGatewayDefinitions(): GatewayDefinition[] {
  return DEFINITIONS
}

export function getGatewayDefinition(key: string): GatewayDefinition | undefined {
  return DEFINITIONS.find((definition) => definition.key === key)
}

export function gatewayDefaultEnabled(key: string): boolean {
  return DEFAULT_ENABLED[key] ?? false
}

export function isGatewayImplemented(key: string): boolean {
  return IMPLEMENTED[key] === true
}

export function defaultGatewayKey(): string {
  return DEFAULT_GATEWAY_KEY
}
