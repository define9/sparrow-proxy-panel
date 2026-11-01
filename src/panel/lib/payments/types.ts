import type { FieldSpec } from '@/lib/plugin-host/types'

/**
 * 支付渠道的 HTTP 契约（对外字段不能变）。
 *
 * 渠道声明不在本目录写死：来自 plugins 表里 type='payment' 的插件，
 * manifest.configSchema 经 lib/plugin-host/schema.ts 转成 FieldSpec[]。
 */

export type { FieldSpec, FieldType } from '@/lib/plugin-host/types'

/** secret 字段的回显占位符；提交同一占位符表示「保留原值」 */
export const MASK = '••••'

/** 渠道声明（只读视图，不含配置） */
export interface GatewayDefinition {
  /** 插件 key：payment-epay */
  key: string
  name: string
  description: string
  docsUrl?: string
  fields: FieldSpec[]
  /** 该渠道支持的支付方式（前端展示用） */
  methods?: { label: string; value: string }[]
}

/** 返回给管理端的渠道视图（secret 字段已脱敏） */
export interface GatewayView extends GatewayDefinition {
  /** 兼容前端已写好的短名：epay / stripe（= key 去掉 payment- 前缀） */
  id: string
  enabled: boolean
  config: Record<string, string>
  /** 该渠道是否已经填过任意 secret 字段 */
  hasSecret: boolean
}

export interface GatewayList {
  default: string
  gateways: GatewayView[]
}

export interface GatewayPatch {
  enabled?: boolean
  config?: Record<string, unknown>
}

export interface GatewayTestCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface GatewayTestResult {
  ok: boolean
  checks: GatewayTestCheck[]
}

/** 旧设置页的两个开关（settings 接口兼容视图） */
export interface LegacyPaymentView {
  epayEnabled: boolean
  stripeEnabled: boolean
}

/** 旧设置接口提交的支付片段（含 epayEnabled / stripeEnabled） */
export interface LegacyPaymentPatch {
  epayEnabled?: boolean
  stripeEnabled?: boolean
  default?: string
  gateways?: Record<string, GatewayPatch | undefined>
}

/** 下单支付应答里的模式：demo = 演示网关直接落定，gateway = 走已配置渠道 */
export type PaymentMode = 'demo' | 'gateway'
