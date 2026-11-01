import type { BuiltinPlugin } from '../types'

/**
 * 内置支付渠道：Stripe。
 *
 * 当前只保存配置，尚未实现真实下单链路（见 lib/payments/index.ts 的 IMPLEMENTED_GATEWAYS）。
 */
export const paymentStripe: BuiltinPlugin = {
  key: 'payment-stripe',
  name: 'Stripe',
  type: 'payment',
  version: '1.0.0',
  description: '国际信用卡渠道，当前仅保存配置，尚未实现真实对接。',
  docsUrl: 'https://docs.stripe.com/keys',
  manifest: {
    configSchema: {
      type: 'object',
      required: ['publishableKey', 'secretKey'],
      properties: {
        publishableKey: {
          type: 'string',
          title: 'Publishable Key',
          'x-placeholder': 'pk_live_...'
        },
        secretKey: {
          type: 'string',
          title: 'Secret Key',
          format: 'password',
          'x-secret': true
        },
        webhookSecret: {
          type: 'string',
          title: 'Webhook Secret',
          format: 'password',
          'x-secret': true,
          description: 'Stripe 后台 Webhook 签名密钥'
        }
      }
    },
    methods: [{ label: '信用卡', value: 'card' }]
  }
}
