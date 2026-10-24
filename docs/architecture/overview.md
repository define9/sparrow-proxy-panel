# 系统架构总览

## 1. 架构分层

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                                │
│  ├─ 用户端 (SSR)          ├─ 管理端 (SSR)         └─ 订阅客户端 (纯文本) │
└───────────┬──────────────────────┬──────────────────────────┬─────────┘
            │ HTTPS                │ HTTPS                    │ HTTPS
┌───────────▼──────────────────────▼──────────────────────────▼─────────┐
│  Panel · Nuxt 4 (Nitro)                                                │
│                                                                       │
│  app/  ── 用户端 / 管理端 UI（Nuxt UI v4）                             │
│  server/                                                                │
│    ├─ api/user      用户端接口（session）                              │
│    ├─ api/admin     管理端接口（session + RBAC）                       │
│    ├─ api/agent     节点接口（HMAC 签名）        ← 独立鉴权边界         │
│    ├─ api/plugin    插件回调入口（per-plugin token）                   │
│    ├─ routes/       订阅输出（流式、CDN 缓存）                        │
│    ├─ tasks/        定时任务（流量聚合 / 过期 / 同步）                 │
│    └─ utils/        db · quota · auth · crypto · plugin-host         │
│                                                                       │
│  packages/contracts ── zod schema（唯一契约源）                       │
└───────┬─────────────────────┬──────────────────────┬──────────────────┘
        │ Drizzle              │ ioredis              │ BullMQ
┌───────▼────────┐   ┌────────▼────────┐   ┌─────────▼──────────┐
│ PostgreSQL 17  │   │   Redis 7        │   │  Queue (BullMQ)     │
│ 业务数据        │   │ 缓存/限流/计数器  │   │ 异步任务            │
│ 迁移/分区表     │   │ 会话/实时状态     │   │ 重试/死信           │
└────────────────┘   └──────────────────┘   └────────────────────┘
        ▲
        │ HTTPS（Agent 协议）
┌───────┴──────────────────────────────────────────────────────────────┐
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
- 部署只需 `node .output/server/index.mjs` + Postgres + Redis
- 未来如需拆分，Nitro 可独立部署（`nuxt build` 的 server 产物可单独跑），但 MVP 不需要

### 2.3 写路径分层（性能核心）

高频写（流量计数、心跳、在线状态）**不进 Postgres 主写路径**：

```
Agent 上报 ──► Redis 计数器 (INCRBY) ──► 定时任务批量落库 ──► traffic_daily / subscription 汇总
```

低频写（订单、用户、节点配置）直接落库。

读路径：订阅输出与节点配置渲染结果进 Redis 缓存，TTL 30s + 事件失效（写操作主动 `DEL`）。

### 2.4 定时任务

用 Nitro 的 `server/tasks/`（可配置 `cron`），无需引入独立调度器：

| 任务 | 频率 | 职责 |
|---|---|---|
| `traffic:flush` | 1 min | Redis 计数器 → 日汇总表 → 更新订阅已用流量 |
| `traffic:rollup` | 1 h | 小时 → 日 → 月汇总（配合分区表裁剪） |
| `subscription:expire` | 10 min | 到期订阅下线、订单过期关闭 |
| `node:health` | 1 min | 心跳超时判定，标记节点离线 |
| `node:sync` | 5 min | 向在线节点下发配置版本变更 |
| `plugin:sync` | 1 h | 三方插件源拉取、校验、升级 |
| `log:prune` | 1 d | 日志分区裁剪、过期 token 清理 |

多副本部署时，任务需选主（Nitro 支持 `experimental.tasks` + DB 驱动锁；或用 Redis 分布式锁），避免重复执行。

## 3. 部署拓扑

### 3.1 单机（自托管用户最常见）

```
Caddy/Nginx (TLS, 静态资源缓存)
   └── Panel (Node, 2 副本可选)
         ├── PostgreSQL 17 (容器, 本地卷)
         └── Redis 7 (容器)
```

### 3.2 生产（中等规模）

```
CDN / WAF
   └── LB (HTTPS, HTTP/2)
         ├── Panel × N (容器, 无状态, 会话存 Redis)
         ├── PostgreSQL × 2 (主从 + PITR)
         └── Redis × 2 (主从, Sentinel)
```

### 3.3 节点侧

```
Agent (systemd, /usr/local/bin/sparrow-agent)
  ├── sing-box 或 Xray (子进程/同进程)
  └── /etc/sparrow-agent/config.yaml + 本地配置缓存
```

## 4. 请求生命周期示例

### 4.1 用户拉取订阅

```
GET /api/v1/subscribe/{token}
 → 校验 token（Redis 缓存命中则直接返回渲染结果）
 → 命中缓存：返回（Cache-Control: private, max-age=60）
 → 未命中：查 subscription + 关联节点组
   → 调 subscription renderer（v2ray / clash / sing-box）
   → 写 Redis 缓存
   → 返回流式文本
```

订阅渲染是**纯函数**：`(subscription, nodes, format) → string`，放在 `packages/contracts` 定义的接口后面，实现在 `server/utils/subscription/`，可被插件覆盖（`subscription.render` hook）。

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
 → 验签 → 幂等检查（seq 去重）→ Redis INCRBY
 → 立即返回 202（不阻塞等待落库）
 → traffic:flush 任务统一落库
```

## 5. 性能预算

| 路径 | 目标 P95 | 手段 |
|---|---|---|
| 后台列表 API | < 200ms | 索引 + keyset 分页 + 只 SELECT 需要的列 |
| 订阅输出 | < 80ms | Redis 缓存 + 流式响应 |
| 商品列表 | < 100ms | SSR + 页面级缓存 + 静态化 |
| 节点配置渲染 | < 300ms | 模板预编译 + 配置缓存 |
| 面板首屏 LCP | < 1.5s | SSR + 关键 CSS 内联 + 图标本地化 |
| 100 并发 Agent 心跳 | 无明显抖动 | 心跳写 Redis 不落库 |

## 6. 可用性与容错

| 故障 | 影响 | 应对 |
|---|---|---|
| Panel 宕机 | 无法下单/订阅更新 | Agent 用缓存配置继续服务；恢复后自动补偿 |
| Postgres 宕机 | 面板不可用 | Agent 无感；面板恢复后从 Redis 补偿未落库流量 |
| Redis 宕机 | 缓存与计数失效 | 降级直连 DB；面板可用但性能下降；计数器回退为直写 DB |
| 单节点宕机 | 部分用户受影响 | 订阅渲染时剔除离线节点；节点健康检查自动下线 |
| Agent 与面板断连 | 无 | 本地缓存 + 指数退避重连 + 心跳超时仅标记面板侧状态 |
