# API 设计

## 0. 通用约定

| 项 | 约定 |
|---|---|
| 前缀 | `/api/v1/...`（`/api` 下不再有版本目录以外的业务前缀） |
| 编码 | `application/json; charset=utf-8`（订阅接口除外，返回纯文本） |
| 字段命名 | camelCase（数据库用 snake_case，Drizzle 层转换） |
| 时间 | ISO 8601 UTC，如 `2026-10-24T08:00:00.000Z` |
| 金额 | 字符串传递，避免 JS 浮点误差：`"19.90"` |
| 字节 | 数字（字节），前端用格式化函数转 GB/TB |
| 鉴权 | 见 §2，四套独立凭据 |

### 成功响应

单对象直接返回；**分页集合**统一封装：

```json
{
  "data": [ ... ],
  "meta": { "total": 128, "page": 1, "pageSize": 20, "hasMore": false }
}
```

两类例外，直接返回裸数组（没有分页语义）：

| 场景 | 例子 |
|---|---|
| 固定规模的查询列表 | `GET /public/plans`、`GET /user/plans`、`GET /admin/node-groups` |
| 时间序列 | `GET /user/traffic`、`GET /admin/stats/traffic` |

判据：**会分页的用 `{ data, meta }`，不会分页的用数组**。前端 `apiFetch<ListResponse<T>>` 与 `apiFetch<T[]>` 分别对应。

### 错误响应

```json
{
  "statusCode": 422,
  "code": "PLAN_OUT_OF_STOCK",
  "message": "商品库存不足",
  "data": { "field": "planId" }
}
```

`code` 是机器可读错误码，`message` 面向用户（前端可直接展示，或由 i18n key 覆盖）。

### 错误码分段

| 段 | 含义 | 示例 |
|---|---|---|
| `AUTH_*` | 认证与会话 | `AUTH_INVALID_CREDENTIALS` `AUTH_2FA_REQUIRED` `AUTH_TOKEN_EXPIRED` |
| `PERM_*` | 权限 | `PERM_DENIED` `PERM_SCOPE_MISSING` |
| `USER_*` | 用户 | `USER_NOT_FOUND` `USER_DISABLED` `USER_EMAIL_TAKEN` |
| `PLAN_*` | 商品 | `PLAN_OUT_OF_STOCK` `PLAN_INACTIVE` |
| `ORDER_*` | 订单 | `ORDER_NOT_FOUND` `ORDER_ALREADY_PAID` `ORDER_EXPIRED` |
| `PAY_*` | 支付 | `PAY_SIGN_INVALID` `PAY_GATEWAY_UNAVAILABLE` `PAY_AMOUNT_MISMATCH` |
| `SUB_*` | 订阅 | `SUB_NOT_FOUND` `SUB_EXPIRED` `SUB_OVERUSED` `SUB_DEVICE_LIMIT` |
| `NODE_*` | 节点 | `NODE_NOT_FOUND` `NODE_DUPLICATED` `NODE_CERT_EXPIRED` |
| `AGENT_*` | 节点通信 | `AGENT_SIGN_INVALID` `AGENT_TIMESTAMP_SKEW` `AGENT_VERSION_TOO_OLD` |
| `PLUGIN_*` | 插件 | `PLUGIN_NOT_INSTALLED` `PLUGIN_PERMISSION_DENIED` `PLUGIN_HOOK_FAILED` `PLUGIN_REPO_FORBIDDEN` `PLUGIN_MANIFEST_INVALID` `PLUGIN_VERSION_INCOMPATIBLE` `PLUGIN_INSTALL_FAILED` |
| `RATE_*` | 限流 | `RATE_LIMITED` |

### 分页

- 管理端用 **keyset（游标）分页**：传 `cursor`（上一页最后一条的排序值），返回 `meta.nextCursor`
- 用户端列表量小，可用 `page`/`pageSize`（上限 100）
- 所有列表接口强制上限，禁止 `limit` 无上限

---

## 1. 路由总览

```
/api/v1
├── auth/          登录、注册、验证码、2FA、找回密码
├── user/          用户端资源（当前登录者）
├── admin/         管理端资源（RBAC）
├── agent/         节点通信（HMAC 签名，独立于用户体系）
├── plugin/        插件回调入口（per-plugin token）
├── public/        公开接口（商品列表、公告、站点配置）
└── ...             特殊路径见 §5
```

### 1.1 已实现清单（71 个 handler，与本表逐条核对）

| 域 | 已实现 |
|---|---|
| auth | `login` `logout` `me` `register` `email-code` `password/forgot` `password/reset` |
| setup | `setup`（一次性初始化）、`setup/status` |
| user | `overview` `plans` `plans/{id}` `orders` `orders/{no}` `orders/{no}/cancel` `orders/{no}/pay` `subscriptions` `subscriptions/{id}` `traffic` |
| admin | `plans`(+`{id}`/`duplicate`) `orders`(+`{id}`/`complete`/`refund`) `subscriptions`(+`{id}`/`batch`) `nodes`(+`{id}`/`sync`) `node-groups` `node-certificates`(+`{id}`) `users`(+`{id}`/`balance`/`sessions`) `coupons`(+`{id}`) `logs/{audit,login,tasks,agent}` `settings` `settings/mail/test` `payment/gateways`(+`{key}`/`test`) `payment/default` `stats/{overview,traffic,revenue,nodes}` `jobs/{name}/run` `plugins`(+`{key}`/`jobs`) `plugin-sources` `plugins/install`（501，流水线未实现） |
| agent | `register` `heartbeat` `config` `traffic` `commands` `commands/{id}/ack` |
| public | `plans` `site` `status` |
| 特殊 | `/sub/{token}`、`/sub/{token}/info` |

> 下文表格里其余条目是**设计目标**（如 2FA、用户 profile、API Token、订阅设备管理），尚未实现。

---

## 2. 鉴权模型

四套凭据、三类调用方，**互不复用**，避免一处配置失误导致越权：会话（浏览器）与 PAT（编程）都属于用户身份，但校验路径独立。

### 2.1 用户 / 管理员

- 浏览器：自建会话，cookie 里放 32 字节随机 id（HttpOnly + Secure + SameSite=Lax），`sessions` 表只存 `SHA-256(id)`
- 编程访问：`Authorization: Bearer spx_xxx`（personal_access_token，带 scope）
- 管理端接口：会话 + 权限点校验（`requirePermission('admin:node:write')`）

### 2.2 节点（Agent）

请求头：

| Header | 说明 |
|---|---|
| `X-Node-Id` | 节点 ID（uuid） |
| `X-Timestamp` | Unix 毫秒时间戳 |
| `X-Nonce` | 随机串（16 字节 hex），防重放 |
| `X-Signature` | `HMAC-SHA256(secret, <canonical>)` 的 hex |

canonical 构造（**必须逐字节一致**，双方实现放同一份测试向量）：

```
METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
```

校验规则：
1. `timestamp` 与服务器时间偏差 ≤ 5 分钟
2. `nonce` 在 10 分钟内未出现（进程内存 Map + TTL；单机场景足够）
3. HMAC 常量时间比较（`hmac.Equal`）
4. `secret` 每节点独立，轮换时支持双密钥过渡期（旧密钥 24h 内有效）

### 2.3 插件

`Authorization: Bearer <plugin_token>`，token 由面板签发，绑定 `plugin_id` + 权限点。插件调用面板内部 API 时使用，插件卸载即失效。

---

## 3. 用户端接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册（邮箱 + 密码 + 验证码） |
| POST | `/api/v1/auth/login` | 登录 |
| POST | `/api/v1/auth/logout` | 登出 |
| POST | `/api/v1/auth/email-code` | 发送邮箱验证码（注册/找回密码共用） |
| POST | `/api/v1/auth/2fa/verify` | 2FA 校验（登录第二步，**未实现**） |
| POST | `/api/v1/auth/password/forgot` | 找回密码（发邮件） |
| POST | `/api/v1/auth/password/reset` | 重置密码 |
| GET | `/api/v1/user/profile` | 个人信息（**未实现**，个人设置页目前只读） |
| PATCH | `/api/v1/user/profile` | 修改资料（**未实现**） |
| POST | `/api/v1/user/password` | 修改密码（**未实现**） |
| GET | `/api/v1/user/overview` | 首页概览（配额、到期、最近订单、公告） |
| GET | `/api/v1/user/plans` | 可购买商品 |
| GET | `/api/v1/user/plans/{id}` | 商品详情 |
| POST | `/api/v1/user/orders` | 下单（返回支付信息） |
| GET | `/api/v1/user/orders` | 订单列表 |
| GET | `/api/v1/user/orders/{orderNo}` | 订单详情 |
| POST | `/api/v1/user/orders/{orderNo}/cancel` | 取消订单 |
| POST | `/api/v1/user/orders/{orderNo}/pay` | 触发支付（返回网关跳转 URL） |
| GET | `/api/v1/user/subscriptions` | 订阅列表 |
| GET | `/api/v1/user/subscriptions/{id}` | 订阅详情（含各格式订阅链接） |
| PATCH | `/api/v1/user/subscriptions/{id}` | 修改设备数/限速/格式 |
| POST | `/api/v1/user/subscriptions/{id}/reset` | 重置流量（计费或权限控制） |
| POST | `/api/v1/user/subscriptions/{id}/devices` | 踢下线（清设备记录） |
| GET | `/api/v1/user/traffic` | 流量明细（按时间范围聚合） |
| GET | `/api/v1/user/tokens` | API Token 列表 |
| POST | `/api/v1/user/tokens` | 创建 Token |
| DELETE | `/api/v1/user/tokens/{id}` | 吊销 Token |
| GET | `/api/v1/user/notifications` | 站内信 |

---

## 4. 管理端接口

统一前缀 `/api/v1/admin`，全部走 `requirePermission`。

| 方法 | 路径 | 权限点 |
|---|---|---|
| GET | `/admin/stats/overview` | `admin:dashboard:read` |
| GET | `/admin/stats/{metric}` | `admin:dashboard:read` |
| CRUD | `/admin/plans` | `admin:plan:read` / `write` / `delete` |
| POST | `/admin/plans/{id}/duplicate` | `admin:plan:write` |
| GET | `/admin/orders` | `admin:order:read` |
| POST | `/admin/orders/{id}/complete` | `admin:order:write`（手动完成） |
| POST | `/admin/orders/{id}/refund` | `admin:order:refund` |
| GET | `/admin/subscriptions` | `admin:subscription:read` |
| PATCH | `/admin/subscriptions/{id}` | `admin:subscription:write` |
| POST | `/admin/subscriptions/batch` | `admin:subscription:write`（批量改配额/延期） |
| GET | `/admin/nodes` | `admin:node:read` |
| POST | `/admin/nodes` | `admin:node:write` |
| PATCH | `/admin/nodes/{id}` | `admin:node:write` |
| DELETE | `/admin/nodes/{id}` | `admin:node:delete` |
| POST | `/admin/nodes/{id}/sync` | `admin:node:write`（触发下发） |
| GET | `/admin/node-groups` | `admin:node:read` |
| GET | `/admin/node-certificates` | `admin:node:read` |
| POST | `/admin/node-certificates` | `admin:node:write`（含 ACME 申请） |
| GET | `/admin/users` | `admin:user:read` |
| PATCH | `/admin/users/{id}` | `admin:user:write`（角色、状态、备注） |
| POST | `/admin/users/{id}/balance` | `admin:user:balance` |
| POST | `/admin/users/{id}/subscription` | `admin:user:write`（手工开通） |
| POST | `/admin/users/{id}/kick` | `admin:user:write` |
| GET | `/admin/users/{id}/sessions` | `admin:user:read` |
| DELETE | `/admin/users/{id}/sessions/{sid}` | `admin:user:write` |
| GET | `/admin/plugins` | `admin:plugin:read` |
| POST | `/admin/plugins/preview` | `admin:plugin:write`（解析 git URL，返回 manifest 与权限，不落库） |
| POST | `/admin/plugins/install` | `admin:plugin:write`（异步任务，返回 taskId） |
| GET | `/admin/plugins/{key}/install-status` | `admin:plugin:read`（安装/升级进度） |
| POST | `/admin/plugins/{key}/update` | `admin:plugin:write`（装到新目录，探活后切换） |
| POST | `/admin/plugins/{key}/rollback` | `admin:plugin:write`（切回 `previous_version`） |
| POST | `/admin/plugins/{key}/restart` | `admin:plugin:write` |
| PATCH | `/admin/plugins/{key}` | `admin:plugin:write`（配置/启停/授权范围） |
| DELETE | `/admin/plugins/{key}` | `admin:plugin:delete` |
| GET | `/admin/plugins/{key}/logs` | `admin:plugin:read` |
| GET | `/admin/plugins/{key}/jobs` | `admin:plugin:read`（定时任务与最近运行） |
| GET | `/admin/plugin-sources` | `admin:plugin:read` |
| POST | `/admin/plugin-sources` | `admin:plugin:write` |
| POST | `/admin/plugin-sources/{id}/sync` | `admin:plugin:write` |
| GET | `/admin/logs/audit` | `admin:log:read` |
| GET | `/admin/logs/login` | `admin:log:read` |
| GET | `/admin/logs/tasks` | `admin:log:read` |
| GET | `/admin/settings` | `admin:settings:read` |
| PUT | `/admin/settings` | `admin:settings:write` |
| POST | `/admin/settings/mail/test` | `admin:settings:write`（用当前配置发测试信） |
| GET | `/admin/payment/gateways` | `admin:settings:read`（渠道声明 + 脱敏配置） |
| PUT | `/admin/payment/gateways/{key}` | `admin:settings:write`（`••••` 表示不修改密钥） |
| POST | `/admin/payment/gateways/{key}/test` | `admin:settings:write`（逐项 checks） |
| PUT | `/admin/payment/default` | `admin:settings:write`（默认渠道） |
| POST | `/admin/jobs/{name}/run` | `admin:settings:write`（手动触发定时任务） |
| GET | `/admin/stats/{overview,traffic,revenue,nodes}` | `admin:dashboard:read` |
| GET | `/admin/coupons` | `admin:coupon:read` |
| CRUD | `/admin/coupons` | `admin:coupon:write` |
| GET | `/admin/roles` | `admin:role:read` |

---

## 5. 特殊路径（不在标准 REST 风格内）

| 路径 | 说明 |
|---|---|
| `GET /api/v1/public/plans` | 商品列表（匿名可访问，带缓存头） |
| `GET /api/v1/public/site` | 站点配置（站点名、Logo、公告、是否开放注册） |
| `GET /sub/{token}` | 订阅输出（纯文本，格式由 `?format=` 或 Accept 头决定） |
| `GET /sub/{token}/info` | 订阅信息（JSON，用户端"订阅设置"用） |
| `POST /api/v1/pay/{gateway}/callback` | 支付回调（网关插件注册） |
| `POST /api/v1/plugin/callback/{pluginKey}` | 插件主动回调 |
| `GET /api/v1/public/status` | 面板状态（供节点/监控探活） |

订阅输出要点：
- 返回体为纯文本（`text/plain; charset=utf-8` 或 `application/yaml`）
- `Cache-Control: private, max-age=60`
- 支持 `If-None-Match` → 304
- 命中限流：同一 token 1 分钟内最多 10 次，超限返回 429

---

## 6. Agent 协议

Base：`/api/v1/agent`，全部需要 HMAC 签名。

| 方法 | 路径 | 说明 | 频率 |
|---|---|---|---|
| POST | `/agent/register` | 首次注册（一次性 registration token 换取 node_id + secret） | 一次 |
| POST | `/agent/heartbeat` | 心跳：状态、指标、版本、在线用户数 | 30s |
| GET | `/agent/config` | 拉取节点配置（含 `version`） | 变化时 + 5min 兜底 |
| POST | `/agent/traffic` | 上报流量（批量，幂等） | 30s |
| POST | `/agent/events` | 上报事件（崩溃、证书过期等） | 事件驱动 |
| GET | `/agent/commands` | 拉取待执行命令（长轮询，最长 25s） | 长轮询 |
| POST | `/agent/commands/{id}/ack` | 命令回执（成功/失败 + 结果） | 事件驱动 |
| GET | `/agent/version` | 面板要求的最低 Agent 版本 | 心跳时附带 |
| GET | `/agent/download/{artifact}` | 二进制/证书/geo 文件下载 | 事件驱动 |

### 6.1 注册

```jsonc
// POST /api/v1/agent/register
// Header: X-Registration-Token（一次性，面板生成）
{ "hostname": "hk-01", "ip": "1.2.3.4", "agentVersion": "1.0.0", "os": "linux", "arch": "amd64" }
```

响应：

```jsonc
{
  "nodeId": "uuid",
  "nodeSecret": "…",       // 仅此一次返回，之后不可再取
  "heartbeatInterval": 30,
  "configPollInterval": 300
}
```

### 6.2 心跳

```jsonc
// POST /api/v1/agent/heartbeat
{
  "status": "online",
  "cpu": 12.5, "memory": 43.1, "disk": 61.0,
  "netRx": 1024000, "netTx": 2048000,
  "onlineUsers": 37,
  "agentVersion": "1.0.0",
  "coreVersion": "1.12.0",
  "core": "sing-box",
  "reportedAt": "2026-10-24T08:00:00Z"
}
```

响应：

```jsonc
{ "ack": true, "configVersion": 42, "minAgentVersion": "1.0.0" }
```

### 6.3 拉取配置

```jsonc
// GET /api/v1/agent/config
// Request: X-Config-Version: 41
// Response 200
{
  "version": 42,
  "core": "sing-box",
  "config": { /* 内核配置 JSON */ },
  "rules": {
    "users": [ { "email": "u_xxx", "uid": 1001, "limit": 10737418240, "downloadSpeed": 0, "uploadSpeed": 0 } ]
  },
  "certificates": [ { "name": "cert-a", "cert": "…", "key": "…" } ],
  "reload": true
}
```

若 `X-Config-Version` 与当前一致 → 返回 `304 Not Modified`（省流量，节点常在弱网）。

### 6.4 流量上报

```jsonc
// POST /api/v1/agent/traffic
{
  "seq": 1024,                       // 单调递增，用于幂等去重
  "items": [
    { "uid": 1001, "upload": 1048576, "download": 10485760 },
    { "uid": 1002, "upload": 0, "download": 524288 }
  ]
}
```

幂等规则：面板记录每个节点已处理的 `max_seq`，`seq <= max_seq` 的请求直接忽略并返回 200（保证重试安全）。

响应 `{ "accepted": 3, "seq": 1024 }`，返回 `202`（异步落库）。

### 6.5 命令

```jsonc
// GET /api/v1/agent/commands  （长轮询，最长 25s）
{
  "commands": [
    { "id": "uuid", "command": "reload_config", "payload": {}, "issuedAt": "..." }
  ]
}
```

命令类型：`reload_config` / `restart_core` / `upgrade_core` / `update_agent` / `set_log_level` / `sync_now`。
执行完调用 `POST /agent/commands/{id}/ack`，body `{ "status": "success", "result": {...} }`。

---

## 7. 限流

| 范围 | 限制 |
|---|---|
| 登录接口 | 5 次 / 分钟 / IP；连续失败 10 次锁定 15 分钟 |
| 注册接口 | 3 次 / 小时 / IP |
| 订阅输出 | 10 次 / 分钟 / token；60 次 / 小时 / IP |
| Agent 心跳 | 120 次 / 分钟 / node_id（容忍时钟漂移与重试） |
| Agent 配置拉取 | 30 次 / 分钟 / node_id |
| 通用 API | 用户 600 次 / 分钟；管理端 1200 次 / 分钟 |
| 插件安装 / 升级 | 5 次 / 小时（单实例），防止被当成任意 git 拉取代理 |

实现：进程内滑动窗口计数（Map + 定期清理），代码在 `lib/rate-limit.ts`，由 route handler 的公共封装统一调用。
`middleware.ts` 跑在 edge runtime，只做基于 cookie 的粗粒度拦截（例如未登录直接 401），不承担业务限流。
单机单实例下无需分布式限流；多副本场景再替换为 PG 表或 Redis 实现（实现收敛在单个文件内）。

## 8. 版本与兼容

- URL 版本：`/api/v1` 固定，破坏性变更走 `/api/v2`（并保留 v1 至少 3 个月）
- **契约先行**：`packages/contracts` 的 zod schema 是唯一真相，改字段流程见 [契约变更流程](../frontend/frontend-architecture.md#9-契约变更流程)
- Agent 向后兼容：面板维护 `minAgentVersion`，新字段只增不删；Agent 遇到未知字段忽略
- 契约漂移检测：CI 重新生成 OpenAPI 与 Go client，`git diff --exit-code` 不通过即失败
