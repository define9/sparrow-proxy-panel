# Sparrow Proxy Panel · 文档索引

代理面板（Panel）+ 节点代理程序（Agent）的产品与技术文档。

## 阅读顺序

### 产品

| # | 文档 | 内容 |
|---|---|---|
| 1 | [product/vision-and-scope.md](product/vision-and-scope.md) | 定位、设计原则、角色、功能范围、MVP 边界 |
| 2 | [product/user-flows.md](product/user-flows.md) | 下单支付、订阅使用、节点接入、管理操作与状态机 |

### 架构

| # | 文档 | 内容 |
|---|---|---|
| 3 | [architecture/overview.md](architecture/overview.md) | 分层、部署拓扑、请求生命周期、定时任务、性能预算 |
| 4 | [architecture/backend-layers.md](architecture/backend-layers.md) | **后端分层**（route → service → db）、复用点、事务、`check:layers` 门禁 |
| 5 | [architecture/tech-stack.md](architecture/tech-stack.md) | 选型与版本（含"为什么不选"） |
| 6 | [architecture/monorepo-layout.md](architecture/monorepo-layout.md) | **ADR-0001：为什么 monorepo**、目录、依赖方向 |
| 7 | [architecture/data-model.md](architecture/data-model.md) | 表结构、索引、迁移策略 |
| 8 | [architecture/api-design.md](architecture/api-design.md) | 接口分层、四套鉴权、Agent 协议、错误码、限流 |
| 9 | [architecture/plugin-system.md](architecture/plugin-system.md) | manifest、hook、插件定时任务、git URL 安装、支付渠道 |
| 10 | [architecture/notify-providers.md](architecture/notify-providers.md) | 邮件 provider 抽象：Resend / 本地日志、密钥脱敏、测试发送 |
| 11 | [architecture/agent-cli.md](architecture/agent-cli.md) | Agent 实现状态、配置、运行循环、自更新、离线容错 |
| 12 | [architecture/agent-sign-vectors.md](architecture/agent-sign-vectors.md) | Panel ↔ Agent 的 HMAC 固定测试向量（跨端对齐基准） |
| 13 | [architecture/security.md](architecture/security.md) | 威胁模型、密钥管理、支付安全、上线检查清单 |

### 前端

| # | 文档 | 内容 |
|---|---|---|
| 14 | [frontend/frontend-architecture.md](frontend/frontend-architecture.md) | 目录、布局、路由、数据获取、性能（预取/缓存） |
| 15 | [frontend/design-system.md](frontend/design-system.md) | shadcn CSS 变量、状态色、图标、字体、明暗模式 |
| 16 | [frontend/i18n.md](frontend/i18n.md) | next-intl 方案、key 规范、CI 校验 |
| 17 | [frontend/navigation.md](frontend/navigation.md) | 菜单与路由、权限过滤、命令面板、快捷键、守卫 |

### 计划与运维

| # | 文档 | 内容 |
|---|---|---|
| 18 | [roadmap.md](roadmap.md) | P0–P3、验收标准、风险登记（**唯一的进度记录**） |
| 19 | [deploy-ubuntu.md](deploy-ubuntu.md) | 部署手册：装环境、起服务、反代、初始化、备份、排障 |

## 已锁定的核心决策

| 决策 | 结论 | 依据 |
|---|---|---|
| 仓库形态 | Monorepo（pnpm workspaces + Go module 同仓） | [ADR-0001](architecture/monorepo-layout.md) |
| 前端框架 | Next.js 16 App Router + React 19（后台 CSR，公开页可选 RSC） | [tech-stack](architecture/tech-stack.md) |
| UI | shadcn/ui（源码 copy-in）+ Tailwind 4 + Radix | [design-system](frontend/design-system.md) |
| 颜色 | 只用 shadcn 的 CSS 变量语义类，品牌色在 `globals.css` 定义 | [design-system](frontend/design-system.md) |
| 多语言 | next-intl，cookie 驱动、无路由前缀；导航已翻，页面文案待抽取 | [i18n](frontend/i18n.md) |
| 菜单 | shadcn `Sidebar` + `Command`（cmdk），权限驱动，悬停预取 | [navigation](frontend/navigation.md) |
| 后端 | Route Handlers + `lib/services`（route 不碰 DB，`check:layers` 强制） | [backend-layers](architecture/backend-layers.md) |
| 数据库 | PostgreSQL 17 + Drizzle ORM（31 表） | [data-model](architecture/data-model.md) |
| 部署形态 | 单机单体：`postgres + panel`，反代可选内置 caddy profile | [overview](architecture/overview.md) |
| 定时任务 | `instrumentation.ts` + advisory lock（traffic:flush / subscription:expire / node:health） | [overview](architecture/overview.md) |
| CLI 语言 | Go 1.24+（单静态二进制，面板分发 + 一键安装） | [agent-cli](architecture/agent-cli.md) |
| 跨端契约 | `packages/contracts`（zod）→ OpenAPI → Go 生成；签名用固定向量对齐 | [ADR-0001](architecture/monorepo-layout.md) |
| 插件 | 内置插件走 `plugins` 表 + manifest.configSchema；外部 git 安装未实现 | [plugin-system](architecture/plugin-system.md) |
| 支付渠道 | 插件化（`payment-epay` / `payment-stripe`），字段由 configSchema 驱动 | [plugin-system §8](architecture/plugin-system.md) |
| 邮件 | provider 抽象（`notify-resend` / `notify-log`），密钥加密落库 | [notify-providers](architecture/notify-providers.md) |
| 认证 | 自建数据库会话 + RBAC + PAT + 节点 HMAC + 插件 token | [api-design](architecture/api-design.md) |

## 术语表

| 术语 | 含义 |
|---|---|
| Panel | 面板本体，Next.js 全栈应用，用户与管理员使用 |
| Agent | 部署在代理节点上的 Go 二进制，拉取配置、上报状态与流量 |
| Plugin | 扩展面板能力；内置插件随版本发布，外部插件（git URL 安装）尚未实现 |
| Provider | 某一类能力的可替换实现，如 `notify-resend`（发信）、`payment-epay`（支付） |
| Plan / Order / Subscription | 商品 / 订单 / 订阅（持有 token 与配额） |
| Node / NodeGroup / Core | 节点 / 节点组 / 代理内核（sing-box、xray） |
| Contract | Panel 与 Agent 之间的接口定义，由 `packages/contracts` 生成 |

> 本文档集只描述**当前实现 + 目标设计**；进度以 [roadmap](roadmap.md) 的勾选为准。
