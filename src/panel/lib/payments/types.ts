/**
 * 支付渠道声明式契约。
 *
 * 每个渠道只声明「自己有哪些设置项」，管理端按 fields 自动渲染表单；
 * 新增渠道 = 在 registry.ts 里追加一条声明，不改页面与路由。
 */

export type FieldType = 'text' | 'password' | 'url' | 'select'

export interface FieldSpec {
  /** 配置里的字段名（同时作为 settings.payment.gateways.<key>.config 的 key） */
  key: string
  label: string
  type: FieldType
  placeholder?: string
  help?: string
  required?: boolean
  /** true 时回显为 MASK，提交 MASK / 空串表示保留原值 */
  secret?: boolean
  options?: { label: string; value: string }[]
}

export interface GatewayDefinition {
  /** 'epay' | 'stripe' */
  key: string
  /** 展示名 */
  name: string
  description: string
  docsUrl?: string
  fields: FieldSpec[]
  /** 该渠道支持的支付方式（可选，前端展示用） */
  methods?: { label: string; value: string }[]
}

/** settings.payment.gateways.<key> 的存储结构 */
export interface GatewayConfig {
  enabled: boolean
  config: Record<string, string>
}

/** settings.payment 的存储结构 */
export interface PaymentSettings {
  default: string
  gateways: Record<string, GatewayConfig>
}

/** 返回给管理端的渠道视图（secret 字段已脱敏） */
export interface GatewayView extends GatewayDefinition {
  enabled: boolean
  config: Record<string, string>
  /** 该渠道是否已经填过任意 secret 字段 */
  hasSecret: boolean
}

export interface GatewayList {
  default: string
  gateways: GatewayView[]
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

/** 下单支付应答里的模式：demo = 演示网关直接落定，gateway = 走已配置渠道 */
export type PaymentMode = 'demo' | 'gateway'
