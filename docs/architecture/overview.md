# 系统架构总览

> **架构前提：单机单体应用。** 不引入 Redis、Kafka 等独立中间件，不做多服务拆分。
> 所有状态在 PostgreSQL + 进程内存里；需要扩容时，先加索引/分区，再考虑多副本。

## 1. 架构分层

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│  ├─ 用户端（CSR）      ├─ 管理端（CSR）      └─ 订阅客户端（纯文本）    │
└───────────┬──────────────────────┬──────────────────────────┬────────┘
            │ HTTPS                │ HTTPS                    │ HTTPS
┌───────────▼──────────────────────▼──────────────────────────▼────────┐
│  Panel · Next.js 16 —— 单进程同时承载页面与 API                        │
│                                                                       │
│  app/                                                                 │
│    ├─ (marketing) / (auth) / (user) / (admin)   页面（默认 CSR）       │
│    ├─ api/v1/user     用户端接口（会话）                               │
│    ├─ api/v1/admin    管理端接口（会话 + RBAC）                        │
│    ├─ api/v1/agent    节点接口（HMAC 签名）      ← 独立鉴权边界        │
│    ├─ api/v1/plugin   插件回调入口（per-plugin token）                 │
│    ├─ api/v1/public   公开接口（缓存友好）                             │
│    └─ sub/[token]      订阅输出（纯文本 route handler）                │
│  lib/                                                                 │
│    ├─ services/       业务服务层（15 个域，页面与 route handler 共用）  │
│    ├─ plugin-host/    内置插件注册表（payment-epay / payment-stripe）  │
│    ├─ notify/         邮件 provider（resend / log）                    │
│    ├─ payments/       支付渠道：plugins 表 + manifest.configSchema     │
│    ├─ jobs/           定时任务（advisory lock）                        │
│    └─ db/ · auth/ · subscription/ · agent/                             │
│  instrumentation.ts   定时任务（node-cron）                            │
│  packages/contracts   zod schema（唯一契约源）                         │
└───────┬──────────────────────────────────────────────────────────────┘
        │ Drizzle（连接池）
┌───────▼──────────────────────────────────────────────────────────────┐
│ PostgreSQL 17 —— 唯一有状态组件                                        │
│  业务数据 · 迁移 · 分区表 · 枚举 · 索引                                 │
└───────────────────────────────────────────────────────────────────────┘
        ▲
        │ HTTPS（Agent 协议）
┌───────┴───────────────────────────────────────────────────────────────┐
│  Agent CLI（Go，单静态二进制）× N 节点                                 │
│  ├─ 注册 / 心跳 / 拉配置 / 上报流量 / 事件                              │
│  ├─ 内核管理：Xray / sing-box 进程守护、统计读取、热重载                │
│  ├─ 自更新（下载 → 验签 → 原子替换 → 回滚）                            │
│  └─ 离线容错：本地缓存最后一次配置，面板不可达时继续服务                │
└───────────────────────────────────────────────────────────────────────┘
```

## 2. 关键设计决策

### 2.1 控制面与数据面分离

Panel **不承载任何用户流量**，只下发"意图"（配额、路由、节点配置、命令）；Agent 在节点上执行。收益：

- 面板故障不影响已付费用户继续使用（Agent 缓存配置 + 自愈）
- 面板不需要高带宽出口，部署成本低
- 节点可以是任意云厂商的机器，扩容只需加一条节点记录

### 2.2 单一部署产物

`next build`（`output: 'standalone'`）产出 `server.js` + `.next`，一条命令启动，不拆前后端两套部署：

- pages 与 API 共享 `packages/contracts` 类型，服务端内部（公开页与 route handler）直接调服务层，不绕 HTTP
- 部署只需 Node 进程 + PostgreSQL
- 未来要拆：`app/api/**` 本来就是标准 HTTP 接口，可整体迁出，前端只改 baseURL

### 2.3 单机状态管理原则

| 状态 | 存放位置 | 理由 |
|---|---|---|
| 业务数据 | PostgreSQL | 唯一真相来源，事务保证 |
| 会话 | `sessions` 表 + HttpOnly cookie | 需要管理端强制下线 |
| 验证码 / 限流计数 / nonce | 进程内存（Map + TTL） | 单机足够，重启即失效（安全上更安全） |
| 订阅渲染缓存 | 进程内存（Map + TTL 30s） | 写操作主动失效 |
| 流量累计 | 进程内存聚合 → 定期批量 UPSERT | 避免高频小事务打 DB |
| 异步任务 | `task_runs` 表 + node-cron | 不需要 MQ |

**不引入 Redis / MQ**：部署只有两个组件，没有额外运维与备份成本；单机的瓶颈通常在 SQL 而不在缓存。

### 2.4 写路径分层（性能核心）

高频写（流量计数）不直接打 DB：

```
Agent 上报 ──► 进程内存累加（Map<uid, {up, down}>）
            ──► 每 30s 批量 UPSERT 到 traffic_daily + subscriptions.traffic_used
            ──► 进程重启时内存计数丢失 → Agent 重发增量（seq 幂等保护）
```

低频写（订单、用户、节点配置）直接落库。
读路径：订阅输出与节点配置渲染结果进内存缓存，TTL 30s，写操作主动清 key。

### 2.5 定时任务

`instrumentation.ts` 的 `register()` 里启动 node-cron：

| 任务 | 频率 | 职责 |
|---|---|---|
| `traffic:flush` | 30s | 内存计数 → 日汇总表 → 更新订阅已用流量 |
| `traffic:rollup` | 1 h | 小时 → 日 → 月汇总（配合分区裁剪） |
| `subscription:expire` | 10 min | 到期订阅下线、订单过期关闭 |
| `node:health` | 1 min | 心跳超时判定，标记节点离线 |
| `node:sync` | 5 min | 向在线节点下发配置版本变更 |
| `plugin:sync` | 1 h | 三方插件源拉取、校验、升级 |
| `plugin:schedule` | 1 min | 扫 `plugin_jobs` 到期任务，交执行器（见 [plugin-system §5](plugin-system.md)） |
| `log:prune` | 1 d | 日志分区裁剪、过期 token 清理 |

每个任务执行前 `pg_try_advisory_lock(task_name)`，拿不到锁直接跳过——单副本时等价于无锁，多副本时天然去重。

## 3. 部署拓扑

```
Caddy / Nginx（TLS、静态资源缓存）
   └── Panel（容器，next standalone）
         └── PostgreSQL 17（同机或同内网，仅在 compose 内网暴露）
```

两种起法（见 [部署手册](../deploy-ubuntu.md)）：

| 模式 | 组成 | 适用 |
|---|---|---|
| 内置反代 | `caddy + panel + postgres + migrate` | 独占一台机器 |
| 外部反代 | `panel + postgres + migrate`，panel 发布到 `127.0.0.1:3000` | 机器上已有统一 Caddy/Nginx |

扩容路径（按需触发，不预先建设）：

| 瓶颈 | 对策 |
|---|---|
| 流量写多 | `traffic_logs` 分区表 + 批量 UPSERT |
| 列表慢 | 加索引 / keyset 分页 / 只 SELECT 需要的列 |
| 面板 CPU 高 | 多副本 + 负载均衡（会话在库里，天然可横向） |
| 多副本后限流不准 | 内存计数换成 PG 表或 Redis，实现收敛在 `lib/rate-limit.ts` |

## 4. 请求生命周期

### 4.1 用户拉取订阅

```
GET /sub/{token}
 → 校验 token（内存缓存命中则直接返回）
 → 未命中：查 subscription + 关联节点组 → 渲染（v2ray / clash / sing-box）→ 写缓存
 → 返回 text/plain（Cache-Control: private, max-age=60）
```

渲染是**纯函数**：`render(subscription, nodes, format) → string`，放在 `lib/subscription/`，可被 `subscription.render` hook 覆盖。

### 4.2 Agent 拉取配置

```
GET /api/v1/agent/config
 → 验签（HMAC: method + path + timestamp + nonce + sha256(body)）
 → 查 node → node_group → 该组下有效订阅
 → 渲染内核配置（sing-box / xray）
 → X-Config-Version 未变：304
 → 返回 { version, core, config, rules }
```

### 4.3 Agent 上报流量

```
POST /api/v1/agent/traffic  { seq, items: [{ uid, up, down }] }
 → 验签 → 幂等检查（seq 去重）→ 累加到内存计数
 → 立即 202（不阻塞等待落库）
 → traffic:flush 批量落库
```

## 5. 性能预算

| 路径 | 目标 P95 | 手段 |
|---|---|---|
| 后台列表 API | < 200ms | 索引 + keyset 分页 + 只 SELECT 需要的列 |
| 订阅输出 | < 80ms | 内存缓存 + 流式响应 |
| 商品列表 | < 100ms | 服务层查询 + 公开接口缓存 |
| 节点配置渲染 | < 300ms | 模板预编译 + 内存缓存 |
| 首屏 LCP | < 1.5s | 骨架屏即时可见 + `next/font` 自托管 + 路由级 code split |
| 1000 节点 × 30s 心跳 | < 5% CPU | 批量 UPSERT，避免逐条事务 |

## 6. 可用性与容错

| 故障 | 影响 | 应对 |
|---|---|---|
| Panel 宕机 | 无法下单/订阅更新 | Agent 用缓存配置继续服务；恢复后自动补偿 |
| Postgres 宕机 | 面板不可用 | Agent 无感；恢复后从 Agent 增量补报流量 |
| 面板进程重启 | 内存缓存与计数丢失 | 订阅缓存重建；流量由 Agent 重发增量（seq 幂等） |
| 单节点宕机 | 部分用户受影响 | 渲染时剔除离线节点；健康检查自动下线 |
| Agent 与面板断连 | 无 | 本地缓存 + 指数退避重连；面板侧仅标记状态 |
