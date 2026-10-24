# 系统架构总览

> **架构前提：单机单体应用。** 不引入 Redis、Kafka 等独立中间件，不做多服务拆分。
> 所有状态在 PostgreSQL + 进程内存里；需要扩展时，先加索引/分区，再考虑横向扩容。

## 1. 架构分层

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                                │
│  ├─ 用户端 (SSR)          ├─ 管理端 (SSR)         └─ 订阅客户端 (纯文本) │
└───────────┬──────────────────────┬──────────────────────────┬─────────┘
            │ HTTPS                │ HTTPS                    │ HTTPS
┌───────────▼──────────────────────▼──────────────────────────▼─────────┐
│  Panel · Nuxt 4 (Nitro) —— 单进程同时承载前端与 API                    │
│                                                                       │
│  app/  ── 用户端 / 管理端 UI（Nuxt UI v4）                             │
│  server/                                                                │
│    ├─ api/user      用户端接口（session）                              │
│    ├─ api/admin     管理端接口（session + RBAC）                       │
│    ├─ api/agent     节点接口（HMAC 签名）        ← 独立鉴权边界         │
│    ├─ api/plugin    插件回调入口（per-plugin token）                   │
│    ├─ routes/       订阅输出（流式）                                  │
│    ├─ tasks/        定时任务（Nitro tasks，进程内）                    │
│    └─ utils/        db · quota · auth · crypto · plugin-host          │
│                                                                       │
│  packages/contracts ── zod schema（唯一契约源）                       │
└───────┬──────────────────────────────────────────────────────────────┘
        │ Drizzle（连接池）
┌───────▼──────────────────────────────────────────────────────────────┐
│ PostgreSQL 17 —— 唯一有状态组件                                        │
│  业务数据 · 迁移 · 分区表 · 枚举 · 索引                                 │
└───────────────────────────────────────────────────────────────────────┘
        ▲
        │ HTTPS（Agent 协议）
┌───────┴───────────────────────────────────────────────────────────────┐
│  Agent CLI (Go, 单静态二进制)  × N 节点                                 │
│  ├─ 注册 / 心跳 / 拉配置 / 上报流量 / 事件                              │
│  ├─ 内核管理：Xray / sing-box 进程守护、统计读取、配置热重载            │
│  ├─ 自更新（下载 → 验签 → 原子替换 → 回滚）                            │
│  └─ 离线容错：本地缓存最后一次配置，面板不可达时继续服务                  │
└───────────────────────────────────────────────────────────────────────┘
```

## 2. 关键设计决策

### 2.1 控制面与数据面分离

Panel **不承载任何用户流量**，只下发"意图"（配额、路由、节点配置、命令）；Agent 在节点上执行。带来的直接收益：

- 面板故障不影响已付费用户继续使用（Agent 缓存配置 + 自愈）
- 面板不需要高带宽出口，部署成本低
- 节点可以是任意云厂商的机器，横向扩展只需在面板加一个节点记录

### 2.2 单一部署产物

Panel = 一个 Nuxt 应用（前端 SSR + Nitro API 同进程同产物），不拆前后端两个仓库/两套部署。理由：

- 前后端共享 `packages/contracts` 的类型，`$fetch` 在服务端可直接调用内部 API，无需额外网关
- 部署只需 `node .output/server/index.mjs` + PostgreSQL
- 未来如需拆分，Nitro 可独立部署（`nuxt build` 的 server 产物可单独跑），但 MVP 不需要

### 2.3 单机状态管理原则

| 状态 | 存放位置 | 理由 |
|---|---|---|
| 业务数据 | PostgreSQL | 唯一真相来源，事务保证 |
| 会话 | 加密 Cookie（无状态） | 多副本也安全，单机更简单 |
| 验证码 / 限流计数 / nonce | 进程内存（Map + TTL） | 单机足够，重启即失效（安全上更安全） |
| 订阅渲染缓存 | 进程内存（Map + TTL 30s） | 写操作主动失效 |
| 流量累计 | 进程内存聚合 → 定期批量 UPSERT | 避免高频小事务打 DB |
| 异步任务 | Nitro tasks（进程内定时） | 不需要 MQ；长耗时任务用 DB 任务表 + 轮询 |

**不引入 Redis / MQ 的收益**：部署只需两个组件（应用 + 数据库），没有额外的运维、备份、监控成本；单机的性能瓶颈通常在 SQL 而不在缓存。

### 2.4 写路径分层（性能核心）

高频写（流量计数）不直接打 DB：

```
Agent 上报 ──► 进程内存累加（按 uid 聚合，Map<uid, {up, down}>）
            ──► 每 30s 批量 UPSERT 到 traffic_daily + subscriptions.traffic_used
            ──► 面板进程重启时，内存计数丢失 → Agent 会重发全量增量（幂等 seq 保护）
```

低频写（订单、用户、节点配置）直接落库。

读路径：订阅输出与节点配置渲染结果进内存缓存，TTL 30s，写操作主动清除对应 key。

### 2.5 定时任务

用 Nitro 的 `server/tasks/`（进程内 `cron`），无需独立调度器：

| 任务 | 频率 | 职责 |
|---|---|---|
| `traffic:flush` | 30s | 内存计数 → 日汇总表 → 更新订阅已用流量 |
| `traffic:rollup` | 1 h | 小时 → 日 → 月汇总（配合分区表裁剪） |
| `subscription:expire` | 10 min | 到期订阅下线、订单过期关闭 |
| `node:health` | 1 min | 心跳超时判定，标记节点离线 |
| `node:sync` | 5 min | 向在线节点下发配置版本变更 |
| `plugin:sync` | 1 h | 三方插件源拉取、校验、升级 |
| `log:prune` | 1 d | 日志分区裁剪、过期 token 清理 |

单实例部署无需选主。若将来要多副本，用 PostgreSQL  advisory lock（`pg_try_advisory_lock`）做选主，避免重复执行。

## 3. 部署拓扑

### 3.1 单机（当前形态，目标形态）

```
Caddy / Nginx（TLS、静态资源缓存）
   └── Panel（Node 进程，PM2 / systemd / Docker）
         └── PostgreSQL 17（同机或同内网）
```

一个数据库、一个应用进程，两条命令即可上线。

### 3.2 扩容路径（按需触发，不预先建设）

| 瓶颈 | 对策 | 不改动代码的部分 |
|---|---|---|
| 流量写多 | `traffic_logs` 分区表 + 批量 UPSERT | 已在 schema 中预留分区字段 |
| 列表慢 | 加索引 / keyset 分页 | Drizzle schema 可增量迁移 |
| 面板 CPU 高 | 多副本 + 负载均衡 | 会话是 Cookie 无状态，内存缓存允许各副本独立 |
| 多副本后限流不准 | 把内存计数换成 PG 表或 Redis | 限流实现收敛在 `server/utils/rate-limit.ts` |

## 4. 请求生命周期示例

### 4.1 用户拉取订阅

```
GET /api/v1/subscribe/{token}
 → 校验 token（内存缓存命中则直接返回渲染结果）
 → 命中缓存：返回（Cache-Control: private, max-age=60）
 → 未命中：查 subscription + 关联节点组
   → 调 subscription renderer（v2ray / clash / sing-box）
   → 写内存缓存
   → 返回流式文本
```

订阅渲染是**纯函数**：`(subscription, nodes, format) → string`，放在 `server/utils/subscription/`，可被插件覆盖（`subscription.render` hook）。

### 4.2 Agent 拉取配置

```
GET /api/v1/agent/config
 → 验签（HMAC: method + path + timestamp + body）
 → 查 node → 查 node_group → 查该组下有效订阅
 → 渲染内核配置（sing-box / xray）
 → 若 config_version 未变：304
 → 返回 { version, core, config, rules }
```

### 4.3 Agent 上报流量

```
POST /api/v1/agent/traffic  { seq, items: [{ uid, up, down }] }
 → 验签 → 幂等检查（seq 去重）→ 累加到内存计数
 → 立即返回 202（不阻塞等待落库）
 → traffic:flush 任务批量落库
```

## 5. 性能预算

| 路径 | 目标 P95 | 手段 |
|---|---|---|
| 后台列表 API | < 200ms | 索引 + keyset 分页 + 只 SELECT 需要的列 |
| 订阅输出 | < 80ms | 内存缓存 + 流式响应 |
| 商品列表 | < 100ms | SSR + 页面级缓存 |
| 节点配置渲染 | < 300ms | 模板预编译 + 内存缓存 |
| 面板首屏 LCP | < 1.5s | SSR + 关键 CSS 内联 + 图标本地化 |
| 100 并发 Agent 心跳 | 无明显抖动 | 心跳 30s 一次，UPSERT 单行 |
| 1000 节点 × 30s 心跳 | < 5% CPU | 批量 UPSERT，避免逐条事务 |

## 6. 可用性与容错

| 故障 | 影响 | 应对 |
|---|---|---|
| Panel 宕机 | 无法下单/订阅更新 | Agent 用缓存配置继续服务；恢复后自动补偿 |
| Postgres 宕机 | 面板不可用 | Agent 无感；面板恢复后从 Agent 增量补报流量 |
| 面板进程重启 | 内存缓存与计数丢失 | 订阅缓存重建即可；流量由 Agent 重发增量（seq 幂等） |
| 单节点宕机 | 部分用户受影响 | 订阅渲染时剔除离线节点；节点健康检查自动下线 |
| Agent 与面板断连 | 无 | 本地缓存 + 指数退避重连 + 心跳超时仅标记面板侧状态 |
