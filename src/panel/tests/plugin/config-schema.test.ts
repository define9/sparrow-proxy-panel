import { describe, expect, it } from 'vitest'
import {
  configSchemaDefaults,
  describeConfigSchema,
  maskConfigValues,
  PLUGIN_SECRET_MASK,
  validateConfigValues
} from '../../shared/utils/plugin-config'

/**
 * 配置表单 schema 生成（manifest.configSchema → 字段 → 校验 → 脱敏）。
 */

const configSchema = {
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
      placeholder: 'https://example.com/notify'
    },
    token: {
      type: 'string',
      title: '签名密钥',
      secret: true
    },
    retry: {
      type: 'integer',
      title: '重试次数',
      default: 3,
      minimum: 0,
      maximum: 10
    },
    verbose: {
      type: 'boolean',
      title: '详细日志'
    },
    extra: {
      type: 'object',
      title: '扩展配置'
    }
  },
  required: ['channel']
}

describe('配置表单 schema 生成', () => {
  it('按 JSON Schema 生成字段描述', () => {
    const schema = describeConfigSchema(configSchema)

    expect(schema.fields).toHaveLength(6)
    expect(schema.required).toEqual(['channel'])

    const channel = schema.fields.find(field => field.key === 'channel')
    expect(channel).toMatchObject({
      key: 'channel',
      title: '通知渠道',
      description: '通知发送渠道',
      widget: 'select',
      type: 'string',
      required: true,
      secret: false,
      default: 'webhook',
      options: ['webhook', 'email']
    })

    const token = schema.fields.find(field => field.key === 'token')
    expect(token?.widget).toBe('password')
    expect(token?.secret).toBe(true)

    const retry = schema.fields.find(field => field.key === 'retry')
    expect(retry?.widget).toBe('number')
    expect(retry?.minimum).toBe(0)
    expect(retry?.maximum).toBe(10)

    const verbose = schema.fields.find(field => field.key === 'verbose')
    expect(verbose?.widget).toBe('switch')

    const extra = schema.fields.find(field => field.key === 'extra')
    expect(extra?.widget).toBe('textarea')

    const endpoint = schema.fields.find(field => field.key === 'endpoint')
    expect(endpoint?.widget).toBe('input')
    expect(endpoint?.placeholder).toBe('https://example.com/notify')
  })

  it('required 数组与字段级 required 都会被识别', () => {
    const schema = describeConfigSchema({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'string', required: true }
      },
      required: ['a']
    })

    expect(schema.fields.find(field => field.key === 'a')?.required).toBe(true)
    expect(schema.fields.find(field => field.key === 'b')?.required).toBe(true)
  })

  it('非法输入返回空 schema，不抛异常', () => {
    expect(describeConfigSchema(undefined).fields).toEqual([])
    expect(describeConfigSchema('nope').fields).toEqual([])
    expect(describeConfigSchema({ type: 'object' }).fields).toEqual([])
  })

  it('表单初值来自默认值', () => {
    const schema = describeConfigSchema(configSchema)

    expect(configSchemaDefaults(schema)).toEqual({ channel: 'webhook', retry: 3 })
  })

  it('校验必填、类型、枚举与范围', () => {
    const schema = describeConfigSchema(configSchema)

    expect(validateConfigValues({ channel: 'webhook' }, schema)).toEqual([])

    // 有默认值的必填项：默认值即满足必填
    expect(validateConfigValues({}, schema)).toEqual([])

    // 必填项被清空时报错
    const missing = validateConfigValues({ channel: '' }, schema)
    expect(missing).toHaveLength(1)
    expect(missing[0]?.name).toBe('channel')

    const badEnum = validateConfigValues({ channel: 'sms' }, schema)
    expect(badEnum).toHaveLength(1)
    expect(badEnum[0]?.name).toBe('channel')

    const badType = validateConfigValues({ channel: 'webhook', retry: 'many' }, schema)
    expect(badType).toHaveLength(1)
    expect(badType[0]?.name).toBe('retry')

    const outOfRange = validateConfigValues({ channel: 'webhook', retry: 99 }, schema)
    expect(outOfRange).toHaveLength(1)
    expect(outOfRange[0]?.name).toBe('retry')
  })

  it('没有默认值的必填项缺失时报错', () => {
    const schema = describeConfigSchema({
      type: 'object',
      properties: {
        pid: { type: 'string', title: '商户号', required: true }
      }
    })

    const issues = validateConfigValues({}, schema)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.name).toBe('pid')
  })

  it('密钥字段脱敏', () => {
    const schema = describeConfigSchema(configSchema)
    const masked = maskConfigValues({ channel: 'webhook', token: 'super-secret' }, schema)

    expect(masked.token).toBe(PLUGIN_SECRET_MASK)
    expect(masked.channel).toBe('webhook')
  })

  it('保留键同样脱敏', () => {
    const schema = describeConfigSchema(configSchema)
    const masked = maskConfigValues({ __plugin_token: 'token-value' }, schema)

    expect(masked.__plugin_token).toBe(PLUGIN_SECRET_MASK)
  })
})
