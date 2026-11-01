# 后端分层与复用约定

> 一句话：**Route Handler 只做 HTTP 适配，业务规则只写在 `lib/services/*`，数据访问只用 Drizzle。**
> 违反这条的分层检查见 §8（`pnpm check:layers`）。

## 1. 依赖方向

```
┌──────────────────────────────────────────────────────────────┐
│ app/api/**/route.ts           HTTP 适配层（薄）                │
│   - 解析参数 / zod 校验 / 鉴权 / 调服务 / 映射响应              │
│   - 不允许出现 SQL、事务、状态机、业务 if-else                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ 只能向下
┌───────────────────────────▼──────────────────────────────────┐
│ lib/services/<domain>.ts      业务层（server-only）            │
│   - 业务规则、状态机、事务、审计、DTO 组装                      │
│   - 入参是普通对象，出参是 DTO；不碰 Request/Response           │
│   - 页面（RSC）、定时任务、Agent 接口、测试都复用它             │
└───────────────────────────┬──────────────────────────────────┘
                            │ 只能向下
┌───────────────────────────▼──────────────────────────────────┐
│ lib/db/**                    数据访问层                        │
│   - Drizzle schema + client                                   │
│   - 只被 service 与 jobs 使用                                 │
└──────────────────────────────────────────────────────────────┘

横切关注点（谁都可以用，但不承载业务规则）：
lib/api/response.ts   ApiError / ok / list / route() 包装
lib/api/audit.ts      写审计日志
lib/auth/guard.ts     会话与权限点
lib/schemas/*.ts      zod 入参 schema（route 用来校验）
lib/labels/*.ts       展示常量与纯函数（client-safe，不含数据访问）
```

依赖方向是单向的：**route → service → db**。service 不得 import route，db 不得 import service。

## 2. 各层职责

| 层 | 做什么 | 明确禁止 |
|---|---|---|
| `route.ts` | HTTP 方法导出、取 session、`schema.parse`、调用一个 service、返回 `ok/list/created` | import `@/lib/db`；写 `db.select(...)`；拼装超过 3 行的响应对象；写事务 |
| `services/*.ts` | 业务校验、状态机、事务、审计、DTO 映射、缓存失效 | `import { NextRequest }`；读 cookie/header；返回 Drizzle 原始行 |
| `db/*` | 表定义、连接池 | 业务判断；抛 HTTP 语义错误（用 `ApiError` 的地方在 service） |
| `jobs/*` | 定时任务，内部调 service | 自己写一套与 service 重复的查询 |
| `labels/*` | 文案映射、格式化纯函数 | 任何数据访问 |

## 3. 目录

```
src/panel/
├── app/api/v1/**/route.ts        # 一层一个 handler，通常 < 40 行
├── lib/
│   ├── services/                 # 业务层（每个域一个文件）
│   │   ├── auth.ts
│   │   ├── billing.ts            # 商品 / 订单 / 支付 / 订阅
│   │   ├── admin-commerce.ts
│   │   ├── admin-users.ts
│   │   ├── nodes.ts
│   │   ├── plugins.ts
│   │   ├── coupons.ts
│   │   ├── logs.ts
│   │   ├── settings.ts
│   │   ├── stats.ts
│   │   ├── subscription.ts       # 订阅渲染与输出
│   │   ├── profile.ts            # 个人资料 / 改密 / 登录设备 / API Token
│   │   └── site.ts
│   ├── plugin-host/              # 内置插件注册表（manifest/configSchema）
│   ├── payments/                 # 支付渠道：读 plugins 表 + 字段声明
│   ├── notify/                   # 邮件 provider：resend / log
│   ├── schemas/                  # zod 入参 schema（route 与前端共用）
│   ├── labels/                   # 展示常量（client-safe）
│   ├── api/                      # 客户端的 fetch 封装与 DTO 类型
│   │   ├── client.ts             # apiFetch / ApiClientError / queryKeys
│   │   ├── types.ts              # DTO 类型（双端可用）
│   │   └── <domain>.ts           # 每域的客户端调用封装
│   ├── auth/                     # 会话、密码、守卫、验证码
│   ├── agent/                    # 节点签名、配置渲染
│   ├── jobs/                     # 定时任务
│   ├── db/                       # schema + client
│   └── subscription/             # 三种订阅格式的纯渲染器
└── instrumentation.ts            # 启动定时任务
```

## 4. 一次请求的完整链路

以「管理端手动完成订单」为例。

### 4.1 route：只做翻译

```ts
// app/api/v1/admin/orders/[id]/complete/route.ts
import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { completeOrder } from '@/lib/services/admin-commerce'

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApiSession('admin:order:write')
  const { id } = await ctx.params
  return ok(await completeOrder(session.user.id, id))
})
```

### 4.2 service：业务与事务都在这里

```ts
// lib/services/admin-commerce.ts
import 'server-only'

export async function completeOrder(actorId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const order = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
    if (!order[0]) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
    if (order[0].status === 'paid') return { order: toOrderDto(order[0]), idempotent: true }
    if (order[0].status !== 'pending') {
      throw new ApiError(409, 'ORDER_STATUS_INVALID', '当前状态不允许手动完成')
    }
    ... // 状态迁移 + 开通订阅 + 审计
    await writeAudit(tx, { actorId, action: 'order.complete', targetId: orderId })
  })
}
```

要点：

- 事务在 service 里开，route 不知道有事务
- 状态机只写一次，管理端手动完成与支付回调共用同一个 `settleOrderAsPaid`
- 审计在同事务内写，失败一起回滚

## 5. 必须只写一次的复用点

| 逻辑 | 唯一位置 | 谁用 |
|---|---|---|
| 订单结算（pending → paid + 开通订阅） | `services/billing.ts#settleOrderAsPaid` | 用户支付、管理端手动完成、支付回调 |
| 配额判定（过期 / 超量 / 状态） | `services/quota.ts` | 订阅输出、订阅列表、Agent 规则下发 |
| 订阅渲染（三种格式） | `lib/subscription/render.ts`（纯函数） | `/sub/{token}`、预览、导出 |
| 权限校验 | `lib/auth/guard.ts` | 所有 route 与 layout |
| 错误 → HTTP 响应 | `lib/api/response.ts#toErrorResponse` | 所有 route |
| 审计写入 | `lib/api/audit.ts#writeAudit` | 所有管理端写操作 |
| 展示文案（状态 → 中文） | `lib/labels/*.ts` | 页面组件 |

判断标准：**如果同一段逻辑要在两个地方出现，它就必须下沉到上面这些位置之一。**

## 6. DTO 与类型

- service 返回 DTO，不返回 Drizzle 行。原因：`numeric` 在驱动里是字符串、`timestamp` 是 `Date`、关联表是嵌套对象——这些细节不该漏给前端。
- DTO 类型放 `lib/api/types.ts`（同时被页面与 route 引用），并尽量对齐 `packages/contracts` 的 zod 类型。
- 转换函数命名 `to<X>Dto`，放在产生它的 service 文件里，不跨文件散落。
- 金额、流量一律字符串/数字二选一并写进 DTO 注释（当前：金额 `string`，流量 `number`）。

## 7. 事务与并发

- 涉及多表写入（订单 + 订阅 + 库存）必须用 `db.transaction`
- 需要串行化的读用 `.for('update')`（行锁），不要用应用层锁
- 定时任务用 `pg_try_advisory_lock`（见 `lib/jobs/lock.ts`）
- 注意：Drizzle 的 `tx` 与 `db` 类型不同，service 内部函数要接受 `tx` 参数才能组合

## 8. 自动化门禁

```bash
pnpm --filter panel check:layers
```

检查项：

| 规则 | 判定 |
|---|---|
| route 不得直接访问数据库 | `app/api/**/route.ts` 出现 `from '@/lib/db'` 或 `db.` 调用 → 失败 |
| route 应保持薄 | 单文件 > 120 行 → 失败；> 80 行 → 警告 |
| service 必须标记服务端 | `lib/services/*.ts` 缺 `import 'server-only'` → 警告 |
| 展示层不得访问数据库 | `lib/labels/*.ts` 出现 `@/lib/db` → 失败 |

CI 里与 lint / typecheck 一起跑（见 roadmap P0「CI」）。

## 9. 当前状态与收敛计划

| 项 | 现状 |
|---|---|
| 有服务层 | ✅ `lib/services/` 16 个域（auth / agent / admin-users / settings / nodes / coupons / logs / plugins / billing / admin-commerce / stats / subscription / profile / site / setup / mail） |
| route 直连 db | ✅ 0 个（`check:layers` 通过，77 个 handler 平均 19.9 行，最大 55 行） |
| schema 目录 | ⚠️ 分散在 `lib/api/{schemas,commerce-schemas,node-schemas}.ts`，待合并到 `lib/schemas/` |
| 展示常量 | ⚠️ `lib/billing.ts`、`lib/admin-labels.ts` 在 lib 根，待归入 `lib/labels/` |
| 测试 | ⚠️ 只有 `lib/agent/sign.test.ts`；service 单测待补 |

已完成：28 个 route 的业务下沉到 service（纯重构，响应与错误码逐项比对一致）。
后续新增能力（支付渠道配置、邮件 provider、站点初始化、定时任务触发）也全部按此分层落地。
待做：schema / labels 目录归一、service 单测、把 `check:layers` 接进 CI。
