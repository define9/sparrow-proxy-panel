import type { BuiltinPlugin } from '../types'

/**
 * 内置支付渠道：易支付。
 *
 * 字段声明从 lib/payments/registry.ts 搬过来，形状改成 JSON Schema；
 * 密钥字段用 format: 'password' + x-secret 双标记，面板回显时脱敏。
 */
export const paymentEpay: BuiltinPlugin = {
  key: 'payment-epay',
  name: '易支付',
  type: 'payment',
  version: '1.0.0',
  description: '聚合支付网关（支付宝 / 微信 / QQ），按易支付标准参数对接。',
  docsUrl: 'https://pay.example.com/doc',
  manifest: {
    configSchema: {
      type: 'object',
      required: ['apiUrl', 'pid', 'key'],
      properties: {
        apiUrl: {
          type: 'string',
          title: '网关地址',
          format: 'uri',
          'x-placeholder': 'https://pay.example.com',
          description: '易支付站点根地址，不带 /submit.php'
        },
        pid: {
          type: 'string',
          title: '商户 ID (PID)',
          'x-placeholder': '1001',
          description: '易支付后台的商户 ID'
        },
        key: {
          type: 'string',
          title: '商户密钥',
          format: 'password',
          'x-secret': true,
          'x-placeholder': '商户密钥',
          description: '用于签名校验，只保存在服务端'
        },
        channel: {
          type: 'string',
          title: '默认支付方式',
          description: '下单时默认选中的支付方式',
          enum: ['alipay', 'wxpay', 'qqpay'],
          enumNames: ['支付宝', '微信', 'QQ']
        },
        notifyUrl: {
          type: 'string',
          title: '异步回调地址',
          format: 'uri',
          'x-placeholder': '留空使用站点默认地址',
          description: '留空则用 NEXT_PUBLIC_SITE_URL/api/v1/pay/epay/callback'
        },
        returnUrl: {
          type: 'string',
          title: '同步跳转地址',
          format: 'uri',
          'x-placeholder': '留空使用站点默认地址',
          description: '留空则用 NEXT_PUBLIC_SITE_URL/dashboard/orders'
        }
      }
    },
    methods: [
      { label: '支付宝', value: 'alipay' },
      { label: '微信', value: 'wxpay' },
      { label: 'QQ', value: 'qqpay' }
    ]
  }
}
