/**
 * 插件配置 schema（JSON Schema 子集）→ 表单字段描述 + 配置校验。
 *
 * 前后端共用同一份实现：
 * - 服务端：校验管理员提交的配置（安装 / 更新配置）
 * - 前端：按 manifest.configSchema 自动生成 UForm 表单
 *
 * 只实现 JSON Schema 的常用子集（type / properties / required / enum /
 * default / 长度与范围约束），够用即可，不引入 ajv 等额外依赖。
 */

/** 表单控件类型 */
export type PluginConfigWidget
  = | 'input'
    | 'password'
    | 'textarea'
    | 'number'
    | 'switch'
    | 'select'
    | 'tags'

/** 单个配置项的表单描述 */
export interface PluginConfigField {
  key: string
  title: string
  description?: string
  /** 渲染用的控件类型 */
  widget: PluginConfigWidget
  /** JSON Schema 里的原始类型 */
  type: string
  required: boolean
  /** 是否为密钥字段（加密存储 + 回显脱敏） */
  secret: boolean
  default?: unknown
  /** enum 可选值（仅 string 类型） */
  options?: string[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  placeholder?: string
}

/** 归一化后的配置 schema */
export interface PluginConfigSchema {
  fields: PluginConfigField[]
  /** schema.required 数组 */
  required: string[]
}

/** 校验错误（与 UForm 的 errors 结构对齐：name 为字段路径） */
export interface PluginConfigIssue {
  name: string
  message: string
}

/** 保留键：面板内部使用，不参与 configSchema 校验，也不进表单 */
export const PLUGIN_RESERVED_CONFIG_KEYS = ['__plugin_token'] as const

/** 脱敏占位符 */
export const PLUGIN_SECRET_MASK = '••••••••'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pickWidget(
  type: string,
  secret: boolean,
  options: string[] | undefined,
  prop: Record<string, unknown>
): PluginConfigWidget {
  const ui = isPlainObject(prop.ui) ? prop.ui : {}
  const hinted = asString(ui.widget)

  if (hinted === 'textarea' || hinted === 'tags' || hinted === 'switch' || hinted === 'select') {
    return hinted
  }
  if (secret) {
    return 'password'
  }
  if (options?.length) {
    return 'select'
  }
  if (type === 'boolean') {
    return 'switch'
  }
  if (type === 'number' || type === 'integer') {
    return 'number'
  }
  if (type === 'array') {
    return 'textarea'
  }
  if (type === 'object') {
    return 'textarea'
  }
  return 'input'
}

function buildField(
  key: string,
  prop: Record<string, unknown>,
  requiredByArray: boolean
): PluginConfigField {
  const type = asString(prop.type) ?? 'string'
  const secret = prop.secret === true || prop.writeOnly === true || prop.format === 'password'
  const rawEnum = Array.isArray(prop.enum) ? prop.enum : undefined
  const options = rawEnum
    ?.filter((value): value is string => typeof value === 'string')
  const ui = isPlainObject(prop.ui) ? prop.ui : {}

  const field: PluginConfigField = {
    key,
    title: asString(prop.title) ?? key,
    widget: pickWidget(type, secret, options, prop),
    type,
    required: requiredByArray || prop.required === true,
    secret
  }

  const description = asString(prop.description)
  if (description) {
    field.description = description
  }
  if (prop.default !== undefined) {
    field.default = prop.default
  }
  if (options?.length) {
    field.options = options
  }
  const minimum = asNumber(prop.minimum)
  if (minimum !== undefined) {
    field.minimum = minimum
  }
  const maximum = asNumber(prop.maximum)
  if (maximum !== undefined) {
    field.maximum = maximum
  }
  const minLength = asNumber(prop.minLength)
  if (minLength !== undefined) {
    field.minLength = minLength
  }
  const maxLength = asNumber(prop.maxLength)
  if (maxLength !== undefined) {
    field.maxLength = maxLength
  }
  const pattern = asString(prop.pattern)
  if (pattern) {
    field.pattern = pattern
  }
  const placeholder = asString(prop.placeholder) ?? asString(ui.placeholder)
  if (placeholder) {
    field.placeholder = placeholder
  }

  return field
}

/**
 * 解析 manifest.configSchema（JSON Schema），得到表单字段描述。
 *
 * 输入不合法时返回空 schema（不抛错），由调用方决定如何报错。
 */
export function describeConfigSchema(raw: unknown): PluginConfigSchema {
  const schema = isPlainObject(raw) ? raw : {}
  const properties = isPlainObject(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : []

  const fields = Object.entries(properties).map(([key, value]) =>
    buildField(key, isPlainObject(value) ? value : {}, required.includes(key))
  )

  return { fields, required }
}

/** 表单初值：优先取 schema 默认值 */
export function configSchemaDefaults(schema: PluginConfigSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const field of schema.fields) {
    if (field.default !== undefined) {
      values[field.key] = field.default
    }
  }

  return values
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    default:
      return true
  }
}

/**
 * 按 JSON Schema 校验配置值。
 *
 * 返回的错误可直接交给 UForm 的 validate 回调（{ name, message }）。
 */
export function validateConfigValues(
  values: Record<string, unknown>,
  schema: PluginConfigSchema
): PluginConfigIssue[] {
  const issues: PluginConfigIssue[] = []

  for (const field of schema.fields) {
    const provided = values[field.key]
    const value = provided === undefined ? field.default : provided
    const empty = value === undefined || value === null || value === ''

    if (field.required && empty) {
      issues.push({ name: field.key, message: `${field.title} 为必填项` })
      continue
    }
    if (empty) {
      continue
    }

    if (!matchesType(value, field.type)) {
      issues.push({ name: field.key, message: `${field.title} 类型应为 ${field.type}` })
      continue
    }

    if (field.options?.length && typeof value === 'string' && !field.options.includes(value)) {
      issues.push({ name: field.key, message: `${field.title} 取值不在允许范围内` })
      continue
    }

    if (typeof value === 'string') {
      if (field.minLength !== undefined && value.length < field.minLength) {
        issues.push({ name: field.key, message: `${field.title} 至少 ${field.minLength} 个字符` })
        continue
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        issues.push({ name: field.key, message: `${field.title} 最多 ${field.maxLength} 个字符` })
        continue
      }
      if (field.pattern) {
        try {
          if (!new RegExp(field.pattern).test(value)) {
            issues.push({ name: field.key, message: `${field.title} 格式不正确` })
            continue
          }
        } catch {
          // 非法正则视为不校验
        }
      }
    }

    if (typeof value === 'number') {
      if (field.minimum !== undefined && value < field.minimum) {
        issues.push({ name: field.key, message: `${field.title} 不能小于 ${field.minimum}` })
        continue
      }
      if (field.maximum !== undefined && value > field.maximum) {
        issues.push({ name: field.key, message: `${field.title} 不能大于 ${field.maximum}` })
        continue
      }
    }
  }

  return issues
}

/**
 * 脱敏：密钥字段与保留键一律替换为占位符。
 *
 * TODO(security): 主密钥加密层（runtimeConfig.masterKey）就绪后，
 * secret 字段应加密存储；当前先明文落库，读取时脱敏。
 */
export function maskConfigValues(
  values: Record<string, unknown>,
  schema: PluginConfigSchema
): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...values }

  for (const field of schema.fields) {
    if (field.secret && typeof masked[field.key] === 'string' && masked[field.key]) {
      masked[field.key] = PLUGIN_SECRET_MASK
    }
  }
  for (const key of PLUGIN_RESERVED_CONFIG_KEYS) {
    if (typeof masked[key] === 'string' && masked[key]) {
      masked[key] = PLUGIN_SECRET_MASK
    }
  }

  return masked
}

/** 判断某个配置键是否为密钥字段 */
export function isSecretConfigKey(schema: PluginConfigSchema, key: string): boolean {
  if ((PLUGIN_RESERVED_CONFIG_KEYS as readonly string[]).includes(key)) {
    return true
  }
  return schema.fields.some(field => field.key === key && field.secret)
}
