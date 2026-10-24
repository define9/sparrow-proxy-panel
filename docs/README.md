# Sparrow Proxy Panel · 文档索引

代理面板（Panel）+ 节点代理程序（Agent CLI）的产品与技术文档。

## 阅读顺序

### 产品

| # | 文档 | 内容 |
|---|---|---|
| 1 | [product/vision-and-scope.md](product/vision-and-scope.md) | 定位、设计原则、角色、功能清单、MVP 边界 |
| 2 | [product/user-flows.md](product/user-flows.md) | 注册下单支付、订阅使用、节点接入、管理操作流程与状态机 |

### 架构

| # | 文档 | 内容 |
|---|---|---|
| 3 | [architecture/overview.md](architecture/overview.md) | 分层架构、部署拓扑、请求生命周期、性能预算、容错 |
| 4 | [architecture/tech-stack.md](architecture/tech-stack.md) | 技术选型与版本锁定（含"为什么不选"） |
| 5 | [architecture/monorepo-layout.md](architecture/monorepo-layout.md) | **ADR-0001：为什么 monorepo**，目录结构、依赖方向 |
| 6 | [architecture/data-model.md](architecture/data-model.md) | 数据模型、索引、迁移策略 |
| 7 | [architecture/api-design.md](architecture/api-design.md) | API 分层、三套鉴权、Agent 协议、错误码、限流 |
| 8 | [architecture/plugin-system.md](architecture/plugin-system.md) | 插件 manifest、hook 目录、三方源、插件市场 |
| 9 | [architecture/agent-cli.md](architecture/agent-cli.md) | Agent 设计：配置、运行循环、自更新、离线容错 |
| 10 | [architecture/security.md](architecture/security.md) | 威胁模型、密钥管理、支付安全、上线检查清单 |

### 前端

| # | 文档 | 内容 |
|---|---|---|
| 11 | [frontend/frontend-architecture.md](frontend/frontend-architecture.md) | 目录结构、布局、路由、数据获取、表格/表单模式、契约变更流程 |
| 12 | [frontend/design-system.md](frontend/design-system.md) | **颜色体系**（语义 token / 主题 / 明暗模式）、字体、图标、状态色映射 |
| 13 | [frontend/i18n.md](frontend/i18n.md) | **多语言方案**（@nuxtjs/i18n v10 + Nuxt UI locale）、key 规范、CI 校验 |
| 14 | [frontend/navigation.md](frontend/navigation.md) | **菜单与路由**、权限过滤、命令面板、快捷键、守卫 |

### 计划

| # | 文档 | 内容 |
|---|---|---|
| 15 | [roadmap.md](roadmap.md) | P0–P3 迭代计划、验收标准、并行策略、风险登记 |

## 已锁定的核心决策

| 决策 | 结论 | 依据 |
|---|---|---|
| 仓库形态 | Monorepo（pnpm workspaces + Go module 同仓） | [ADR-0001](architecture/monorepo-layout.md) |
| 前端基线 | `nuxt-ui-templates/dashboard` 官方模板，保留其目录与工程约定 | [tech-stack](architecture/tech-stack.md) |
| 前端 | Nuxt 4.6 + Nuxt UI 4.12（Tailwind 4），最大化使用原生组件 | [frontend-architecture](frontend/frontend-architecture.md) |
| 颜色 | 只用 Nuxt UI 语义 token，品牌色在 `app.config.ts` + `@theme` 定义 | [design-system](frontend/design-system.md) |
| 多语言 | `@nuxtjs/i18n` v10，`no_prefix`，zh-CN + en，Nuxt UI locale 联动 | [i18n](frontend/i18n.md) |
| 菜单 | `UNavigationMenu` + `UDashboardSidebar` + `UDashboardSearch` 命令面板，权限驱动 | [navigation](frontend/navigation.md) |
| 后端 | Nitro（Nuxt 同仓），REST/JSON，路由类型由 Nuxt 生成 | [overview](architecture/overview.md) |
| 数据库 | PostgreSQL 17 + Drizzle ORM 0.45 | [data-model](architecture/data-model.md) |
| 部署形态 | **单机单体**：应用 + PostgreSQL，无 Redis / MQ；缓存与限流用进程内存 | [overview](architecture/overview.md) |
| CLI 语言 | Go 1.24+（单静态二进制） | [agent-cli](architecture/agent-cli.md) |
| 跨端契约 | `packages/contracts`（zod）→ OpenAPI → Go 代码生成，CI 检测漂移 | [ADR-0001](architecture/monorepo-layout.md) |
| 插件运行时 | 进程外 HTTP/gRPC 优先，内置插件同进程 | [plugin-system](architecture/plugin-system.md) |
| 认证 | 会话 + RBAC + PAT + 节点 HMAC 签名 + 插件 token，四套独立 | [api-design](architecture/api-design.md) |

## 术语表

| 术语 | 含义 |
|---|---|
| Panel | 面板本体，Nuxt 全栈应用，用户与管理员使用 |
| Agent | 部署在代理节点上的 CLI（`src/agent`），拉取配置、上报状态与流量 |
| Plan | 商品/套餐（流量、时长、倍率、设备数等售卖规格） |
| Order | 订单，用户购买 Plan 的记录 |
| Subscription | 订阅，购买后获得的凭据载体，持有 token 与配额 |
| Node | 节点，实际承载流量的服务器；属于某个 NodeGroup |
| Core | 内核，指 Xray / sing-box 等代理内核 |
| Plugin | 插件，扩展面板能力（支付网关、三方节点源、订阅渲染等） |
| Contract | 契约，Panel 与 Agent 之间的 API 定义，生成产物，跨端一致 |
| Hook | 插件扩展点，面板在业务节点触发的回调 |

## 工程现状（骨架已落地）

| 能力 | 状态 | 位置 |
|---|---|---|
| Monorepo（pnpm workspaces + Turbo + Go module） | ✅ | `package.json` / `pnpm-workspace.yaml` / `turbo.json` |
| 跨端契约（zod → OpenAPI） | ✅ 14 路径 / 12 组件 | `packages/contracts/` |
| 权限点（24 个，前后端共用） | ✅ | `packages/contracts/src/permissions.ts` |
| 数据模型 | ✅ 33 表 / 28 枚举 | `src/panel/drizzle/schema/` |
| 迁移 | ✅ 已生成并实测 | `src/panel/drizzle/migrations/` |
| 登录 / 会话 / RBAC | ✅ 实测通过 | `server/api/v1/auth/`、`server/utils/auth.ts` |
| 布局与导航 | ✅ 4 布局 / 权限驱动菜单 | `app/layouts/`、`app/utils/navigation.ts` |
| 主题 / 明暗模式 / 中英文 | ✅ | `app/app.config.ts`、`i18n/` |
| CI（lint / typecheck / 契约漂移 / 迁移漂移 / 构建） | ✅ | `.github/workflows/ci.yml` |
| Agent CLI | 骨架 | `src/agent/` |
| 商品 / 订单 / 订阅 / 节点 / 插件 | 待实现 | 见 [roadmap](roadmap.md) |

本地验证记录：`pnpm lint`、`pnpm typecheck`、`pnpm gen:check`、`pnpm db:check`、`pnpm build` 全部通过；
迁移在 PostgreSQL 17 上实跑成功，登录链路（scrypt 校验 → 会话 Cookie → SSR 鉴权）实测通过。
