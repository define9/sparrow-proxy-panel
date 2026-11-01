/**
 * 内置插件的声明式契约。
 *
 * 插件 = 一段声明（manifest）+ 一份配置（plugins.config）。
 * 面板只认 manifest.configSchema，按它自动生成配置表单；
 * 新增支付渠道 = 加一个 builtin 插件文件，不改页面、不改路由。
 *
 * 设计见 docs/architecture/plugin-system.md §3。
 */

export type PluginType = 'payment' | 'notify' | 'node_source' | 'subscription' | 'hook' | 'ui'

export type FieldType = 'text' | 'password' | 'url' | 'select'

/** manifest.configSchema 归一化后的表单字段（接口原样返回给管理端） */
export interface FieldSpec {
  /** 配置里的字段名（同时是 plugins.config 的 key） */
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

/**
 * JSON Schema 的极小子集：只覆盖面板渲染配置表单需要的部分。
 * 额外约定：`x-secret` / `format: 'password'` 表示密钥，`x-placeholder` / `x-help` 给表单用。
 */
export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean'
  title?: string
  description?: string
  format?: 'password' | 'uri' | 'url' | string
  enum?: string[]
  /** enum 的展示名，与 enum 一一对应 */
  enumNames?: string[]
  default?: string | number | boolean
  required?: boolean
  'x-secret'?: boolean
  'x-placeholder'?: string
  'x-help'?: string
  'x-options'?: { label: string; value: string }[]
}

export interface JsonSchema {
  type?: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface PluginManifest {
  /** 字段声明，面板据此渲染配置表单 */
  configSchema: JsonSchema
  /** 该插件支持的支付方式（支付渠道用，前端展示） */
  methods?: { label: string; value: string }[]
  /** 外置插件可以在 manifest 里自带描述；内置插件用声明上的 description */
  description?: string
  docsUrl?: string
}

/** 编译进面板产物的官方插件 */
export interface BuiltinPlugin {
  /** 全局唯一 key：payment-epay / notify-resend */
  key: string
  name: string
  type: PluginType
  version: string
  description: string
  docsUrl?: string
  manifest: PluginManifest
}
