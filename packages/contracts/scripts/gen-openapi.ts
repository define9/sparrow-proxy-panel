/**
 * 生成 OpenAPI 3.1 文档。
 *
 *   pnpm gen          # → packages/contracts/openapi.json
 *   pnpm gen:check    # 重新生成后 git diff 必须为空（CI 契约漂移检测）
 *
 * 产物同时用于：
 *   - Go Agent 客户端代码生成（oapi-codegen）
 *   - 对外开放 API 文档
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createDocument } from 'zod-openapi'
import {
  AgentCommandAckSchema,
  AgentCommandsResponseSchema,
  AgentConfigResponseSchema,
  AgentEventSchema,
  AgentEventsResponseSchema,
  AgentHeartbeatRequestSchema,
  AgentHeartbeatResponseSchema,
  AgentRegisterRequestSchema,
  AgentRegisterResponseSchema,
  AgentTrafficReportSchema,
  AgentTrafficResponseSchema,
  AdminUserListResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  OrderListResponseSchema,
  PlanListResponseSchema,
  RegisterRequestSchema,
  SubscriptionListResponseSchema,
  UserOverviewSchema
} from '../src/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_FILE = resolve(__dirname, '../openapi.json')

/* ── helpers ── */

function json(schema: z.ZodType) {
  return { content: { 'application/json': { schema } } }
}

function ok(schema: z.ZodType, description = '成功') {
  return { description, ...json(schema) }
}

function fail(description: string) {
  return { description, ...json(ErrorResponseSchema) }
}

/** Agent 接口的签名请求头 */
const agentHeaders = z.object({
  'X-Node-Id': z.string().uuid().describe('节点 ID'),
  'X-Timestamp': z.string().describe('Unix 毫秒时间戳（与服务端偏差 ≤ 5 分钟）'),
  'X-Nonce': z.string().describe('随机串，用于防重放'),
  'X-Signature': z.string().describe('HMAC-SHA256(secret, METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nSHA256(body))')
})

const document = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Sparrow Proxy Panel API',
    version: '1.0.0',
    description: [
      '代理面板的 HTTP API。',
      '',
      '分为四个区域：',
      '- `/api/v1/auth` 认证',
      '- `/api/v1/user` 用户端（会话鉴权）',
      '- `/api/v1/admin` 管理端（会话 + RBAC 权限点）',
      '- `/api/v1/agent` 节点通信（HMAC 签名鉴权，与用户体系完全隔离）'
    ].join('\n')
  },
  paths: {
    /* ── 认证 ── */
    '/api/v1/auth/login': {
      post: {
        summary: '登录',
        tags: ['auth'],
        requestBody: { required: true, ...json(LoginRequestSchema) },
        responses: {
          '200': ok(LoginResponseSchema),
          '401': fail('凭据无效'),
          '422': fail('参数校验失败')
        }
      }
    },
    '/api/v1/auth/register': {
      post: {
        summary: '注册',
        tags: ['auth'],
        requestBody: { required: true, ...json(RegisterRequestSchema) },
        responses: {
          '200': ok(z.object({ id: z.string(), email: z.email() })),
          '409': fail('邮箱已存在'),
          '422': fail('参数校验失败')
        }
      }
    },

    /* ── 用户端 ── */
    '/api/v1/user/overview': {
      get: {
        summary: '用户概览',
        tags: ['user'],
        responses: {
          '200': ok(UserOverviewSchema),
          '401': fail('未登录')
        }
      }
    },
    '/api/v1/user/plans': {
      get: {
        summary: '可购买商品列表',
        tags: ['user'],
        responses: {
          '200': ok(PlanListResponseSchema)
        }
      }
    },
    '/api/v1/user/orders': {
      get: {
        summary: '订单列表',
        tags: ['user'],
        responses: {
          '200': ok(OrderListResponseSchema),
          '401': fail('未登录')
        }
      }
    },
    '/api/v1/user/subscriptions': {
      get: {
        summary: '订阅列表',
        tags: ['user'],
        responses: {
          '200': ok(SubscriptionListResponseSchema),
          '401': fail('未登录')
        }
      }
    },

    /* ── 管理端 ── */
    '/api/v1/admin/users': {
      get: {
        summary: '用户列表',
        tags: ['admin'],
        security: [{ session: [] }],
        responses: {
          '200': ok(AdminUserListResponseSchema),
          '403': fail('权限不足')
        }
      }
    },

    /* ── 节点通信（HMAC 签名） ── */
    '/api/v1/agent/register': {
      post: {
        summary: '节点注册',
        description: '使用一次性 registration token 注册，返回 nodeId 与 nodeSecret。',
        tags: ['agent'],
        requestParams: { header: z.object({ 'X-Registration-Token': z.string() }) },
        requestBody: { required: true, ...json(AgentRegisterRequestSchema) },
        responses: {
          '200': ok(AgentRegisterResponseSchema),
          '401': fail('注册令牌无效'),
          '409': fail('节点已注册')
        }
      }
    },
    '/api/v1/agent/heartbeat': {
      post: {
        summary: '心跳',
        tags: ['agent'],
        requestParams: { header: agentHeaders },
        requestBody: { required: true, ...json(AgentHeartbeatRequestSchema) },
        responses: {
          '200': ok(AgentHeartbeatResponseSchema),
          '401': fail('签名无效')
        }
      }
    },
    '/api/v1/agent/config': {
      get: {
        summary: '拉取节点配置',
        description: '请求头携带 X-Config-Version；版本一致时返回 304。',
        tags: ['agent'],
        requestParams: {
          header: agentHeaders.extend({ 'X-Config-Version': z.string().optional() })
        },
        responses: {
          '200': ok(AgentConfigResponseSchema),
          '304': { description: '配置未变更' },
          '401': fail('签名无效')
        }
      }
    },
    '/api/v1/agent/traffic': {
      post: {
        summary: '上报流量',
        description: 'seq 单调递增，重复投递会被忽略（幂等）。',
        tags: ['agent'],
        requestParams: { header: agentHeaders },
        requestBody: { required: true, ...json(AgentTrafficReportSchema) },
        responses: {
          '202': ok(AgentTrafficResponseSchema),
          '401': fail('签名无效')
        }
      }
    },
    '/api/v1/agent/commands': {
      get: {
        summary: '拉取命令（长轮询）',
        tags: ['agent'],
        requestParams: { header: agentHeaders },
        responses: {
          '200': ok(AgentCommandsResponseSchema),
          '401': fail('签名无效')
        }
      }
    },
    '/api/v1/agent/commands/{id}/ack': {
      post: {
        summary: '命令回执',
        tags: ['agent'],
        requestParams: {
          path: z.object({ id: z.string().uuid() }),
          header: agentHeaders
        },
        requestBody: { required: true, ...json(AgentCommandAckSchema) },
        responses: {
          '200': ok(z.object({ ok: z.boolean() })),
          '404': fail('命令不存在')
        }
      }
    },
    '/api/v1/agent/events': {
      post: {
        summary: '上报事件',
        tags: ['agent'],
        requestParams: { header: agentHeaders },
        requestBody: { required: true, ...json(AgentEventSchema) },
        responses: {
          '202': ok(AgentEventsResponseSchema),
          '401': fail('签名无效')
        }
      }
    }
  }
})

writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

const pathCount = Object.keys(document.paths ?? {}).length
const componentCount = Object.keys((document as any).components?.schemas ?? {}).length
console.log(`✔ openapi.json 已生成：${pathCount} 个路径，${componentCount} 个组件 schema`)
