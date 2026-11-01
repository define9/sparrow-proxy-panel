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
| 3 | [architecture/overview.md](architecture/overview.md) | 分层、部署拓扑、请求生命周期、性能预算、容错 |
| 4 | [architecture/tech-stack.md](architecture/tech-stack.md) | 选型与版本（含"为什么不选"） |
| 5 | [architecture/monorepo-layout.md](architecture/monorepo-layout.md) | **ADR-0001：为什么 monorepo**、目录、依赖方向 |
| 6 | [architecture/data-model.md](architecture/data-model.md) | 表结构、索引、迁移策略 |
| 7 | [architecture/api-design.md](architecture/api-design.md) | 接口分层、四套鉴权、Agent 协议、错误码、限流 |
| 8 | [architecture/plugin-system.md](architecture/plugin-system.md) | manifest、hook、定时任务、git URL 安装、支付渠道、索引源 |
| 9 | [architecture/agent-cli.md](architecture/agent-cli.md) | Agent 配置、运行循环、自更新、离线容错 |
| 10 | [architecture/security.md](architecture/security.md) | 威胁模型、密钥管理、支付安全、上线清单 |

### 前端

| # | 文档 | 内容 |
|---|---|---|
| 11 | [frontend/frontend-architecture.md](frontend/frontend-architecture.md) | 目录、布局、路由、数据获取、表格/表单模式 |
| 12 | [frontend/design-system.md](frontend/design-system.md) | shadcn CSS 变量、状态色、图标、字体、明暗模式 |
| 13 | [frontend/i18n.md](frontend/i18n.md) | next-intl 方案、key 规范、CI 校验 |
| 14 | [frontend/navigation.md](frontend/navigation.md) | 菜单与路由、权限过滤、命令面板、快捷键、守卫 |

### 计划

| # | 文档 | 内容 |
|---|---|---|
| 15 | [roadmap.md](roadmap.md) | P0–P3、验收标准、风险登记 |

## 已锁定的核心决策

| 决策 | 结论 | 依据 |
|---|---|---|
| 仓库形态 | Monorepo（pnpm workspaces + Go module 同仓） | [ADR-0001](architecture/monorepo-layout.md) |
| 前端框架 | Next.js 16 App Router + React 19（后台 CSR，公开页可选 RSC） | [tech-stack](architecture/tech-stack.md) |
| UI | shadcn/ui（源码 copy-in）+ Tailwind CSS 4 + Radix | [design-system](frontend/design-system.md) |
| 表格 / 图表 / 表单 | TanStack Table / Recharts（shadcn Chart）/ react-hook-form + zod | [frontend-architecture](frontend/frontend-architecture.md) |
| 颜色 | 只用 shadcn 的 CSS 变量语义类，品牌色在 `globals.css` 定义 | [design-system](frontend/design-system.md) |
| 多语言 | next-intl，cookie 驱动、无路由前缀，zh-CN + en | [i18n](frontend/i18n.md) |
| 菜单 | shadcn `Sidebar` + `Command`（cmdk）命令面板，权限驱动 | [navigation](frontend/navigation.md) |
| 后端 | Next Route Handlers（`app/api/v1`）+ 服务层 `lib/services`（页面与接口共用） | [overview](architecture/overview.md) |
| 数据库 | PostgreSQL 17 + Drizzle ORM | [data-model](architecture/data-model.md) |
| 部署形态 | **单机单体**：Next standalone + PostgreSQL，无 Redis / MQ | [overview](architecture/overview.md) |
| 定时任务 | `instrumentation.ts` 内 node-cron，多副本用 advisory lock 选主 | [overview](architecture/overview.md) |
| CLI 语言 | Go 1.24+（单静态二进制） | [agent-cli](architecture/agent-cli.md) |
| 跨端契约 | `packages/contracts`（zod）→ OpenAPI → Go 代码生成，CI 检测漂移 | [ADR-0001](architecture/monorepo-layout.md) |
| 插件运行时 | 社区插件填 git URL 安装，外置进程运行；内置插件同进程 | [plugin-system](architecture/plugin-system.md) |
| 认证 | 自建数据库会话（`sessions` 表）+ RBAC + PAT + 节点 HMAC + 插件 token | [api-design](architecture/api-design.md) |

## 术语表

| 术语 | 含义 |
|---|---|
| Panel | 面板本体，Next.js 全栈应用，用户与管理员使用 |
| Agent | 部署在代理节点上的 CLI（`src/agent`），拉取配置、上报状态与流量 |
| Plan | 商品/套餐（流量、时长、倍率、设备数等售卖规格） |
| Order | 订单，用户购买 Plan 的记录 |
| Subscription | 订阅，购买后获得的凭据载体，持有 token 与配额 |
| Node | 节点，实际承载流量的服务器；属于某个 NodeGroup |
| Core | 内核，指 Xray / sing-box 等代理内核 |
| Plugin | 插件，扩展面板能力（支付网关、三方节点源、订阅渲染等） |
| Contract | 契约，Panel 与 Agent 之间的 API 定义，生成产物，跨端一致 |
| Hook | 插件扩展点，面板在业务节点触发的回调 |

> 本文档集只描述**目标设计**，不记录交付进度；进度见 [roadmap](roadmap.md) 的勾选状态。
