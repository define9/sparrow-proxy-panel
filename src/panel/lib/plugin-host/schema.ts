import type { FieldSpec, FieldType, JsonSchema, JsonSchemaProperty } from './types'

/**
 * manifest.configSchema（JSON Schema 子集）→ FieldSpec[]。
 *
 * 管理端只认 FieldSpec，插件作者只写 JSON Schema，两者在这里解耦；
 * 未来换成 json-schema-to-zod 自动生成 zod 校验时，只需替换本文件的实现。
 */

function isSecret(property: JsonSchemaProperty): boolean {
  return property['x-secret'] === true || property.format === 'password'
}

function fieldType(property: JsonSchemaProperty): FieldType {
  if (isSecret(property)) return 'password'
  if (property.enum && property.enum.length > 0) return 'select'
  if (property.format === 'uri' || property.format === 'url') return 'url'
  return 'text'
}

function fieldOptions(
  property: JsonSchemaProperty
): { label: string; value: string }[] | undefined {
  if (property['x-options']?.length) return property['x-options']
  if (!property.enum?.length) return undefined
  return property.enum.map((value, index) => ({
    label: property.enumNames?.[index] ?? value,
    value
  }))
}

/** 声明缺失或非法时返回空数组，调用方按「无可配置项」处理，不抛错 */
export function configSchemaToFields(schema: JsonSchema | null | undefined): FieldSpec[] {
  const properties = schema?.properties
  if (!properties || typeof properties !== 'object') return []

  const required = new Set(schema?.required ?? [])

  return Object.entries(properties).map(([key, property]) => {
    const spec: FieldSpec = {
      key,
      label: property.title ?? key,
      type: fieldType(property),
      required: required.has(key) || property.required === true
    }

    const placeholder = property['x-placeholder']
    if (placeholder) spec.placeholder = placeholder

    const help = property['x-help'] ?? property.description
    if (help) spec.help = help

    if (isSecret(property)) spec.secret = true

    const options = fieldOptions(property)
    if (options) spec.options = options

    return spec
  })
}
