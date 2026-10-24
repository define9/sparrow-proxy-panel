# 技术选型

版本以 2026-10 实际发布为准，**锁定精确版本**（`pnpm-lock.yaml` 提交进仓库），升级走 Renovate。

## 1. 基线：Nuxt UI Dashboard 模板

面板代码基线对齐 `nuxt-ui-templates/dashboard`（Nuxt 官方模板），直接复用其目录约定、样式基线与组件用法。差异只在本项目的业务域。

```
src/panel/
├── app/            # 与模板一致
│   ├── app.vue
│   ├── app.config.ts
│   ├── assets/css/main.css
│   ├── components/  # common/ + 各业务域
│   ├── composables/
│   ├── layouts/     # default / dashboard / admin / auth
│   ├── pages/
│   ├── types/
│   └── utils/
├── server/          # 与模板一致（模板只有 api/，我们扩展出 utils/tasks/plugins）
├── eslint.config.mjs
├── nuxt.config.ts
└── package.json
```

## 2. 版本清单

### 2.1 前端（与模板一致，不额外引入 UI 库）

| 包 | 版本 | 用途 |
|---|---|---|
| `nuxt` | ^4.6.2 | 全栈框架 + Nitro |
| `@nuxt/ui` | ^4.12.0 | UI 组件库（含 Dashboard 组件族、UTable、UPricing*） |
| `tailwindcss` | ^4.3.3 | Tailwind v4（`@theme` token 体系） |
| `vue` / `vue-router` | ^3.5.44 / ^5.4.0 | — |
| `@vueuse/nuxt` | ^15.0.0 | `defineShortcuts`、`createSharedComposable` 等 |
| `date-fns` | ^4.4.0 | 日期计算 |
| `@internationalized/date` | ^3.12.4 | 日期格式化（与 UCalendar/UInputDate 配套） |
| `@tanstack/charts` | ^1.1.0 | 图表（Nuxt UI 无原生图表组件，官方 peer） |
| `@iconify-json/lucide` | ^1.2.145 | 本地图标集（SSR 可靠、免网络请求） |
| `@iconify-json/simple-icons` | ^1.2.100 | 支付/三方图标 |
| `zod` | ^4.6.7 | Schema 校验（与 Nuxt UI 表单 Standard Schema 打通） |

> `@tanstack/vue-table` 由 `@nuxt/ui` 自带依赖，`UTable` 开箱可用，无需单独安装。

### 2.2 本项目新增

| 包 | 版本 | 用途 |
|---|---|---|
| `@nuxtjs/i18n` | ^10.6.0 | 多语言（路由前缀、SEO、懒加载） |
| `nuxt-auth-utils` | ^0.5.32 | 会话（加密 cookie）+ 密码哈希（scrypt） |
| `drizzle-orm` | ^0.45.4 | ORM（SQL-first，零运行时开销） |
| `drizzle-kit` | ^0.31.11 | 迁移生成（dev） |
| `pg` | ^8.23.1 | PostgreSQL 驱动 |
| `ioredis` | ^5.11.1 | Redis 客户端（**不用 6.x**：Nitro 的 unstorage peer 要求 `^5.4.2`） |
| `bullmq` | ^6.4.1 | 任务队列 |
| `zod-openapi` | ^6.0.2 | zod → OpenAPI 3.1（契约生成） |

### 2.3 开发工具

| 包 | 版本 | 用途 |
|---|---|---|
| `typescript` | ^6.0.3 | — |
| `@nuxt/eslint` | ^1.17.0 | ESLint 扁平配置 |
| `eslint` | ^10.13.0 | — |
| `eslint-plugin-better-tailwindcss` | ^4.9.1 | Tailwind 类名排序校验（模板已配） |
| `vitest` | ^5.0.5 | 单元测试 |
| `@nuxt/test-utils` | ^4.3.4 | Nuxt 集成测试 |

### 2.4 Agent CLI（Go）

| 组件 | 版本 | 说明 |
|---|---|---|
| Go | 1.24+ | 单静态二进制 |
| `oapi-codegen` | v2 | 从 OpenAPI 生成 Go 客户端 |
| `yaml.v3` | v3 | Agent 配置解析 |
| 无第三方依赖 | — | 优先标准库；HTTP 客户端用 `net/http`；仅在需要时引入 |

## 3. 数据库

**PostgreSQL 17**。

选它的理由（相对 MySQL 8）：

| 能力 | 用途 |
|---|---|
| JSONB + GIN 索引 | 插件配置、节点扩展字段、订单 meta |
| 窗口函数 | 流量排行榜、同比环比 |
| CTE（递归） | 节点组树、权限继承 |
| 部分索引 | `WHERE status = 'active'` 的热路径索引，体积小 |
| 分区表（按日/月） | `traffic_logs` 百万级/天，自动裁剪 |
| `LISTEN/NOTIFY` | 跨副本缓存失效、任务选主 |
| `EXCLUDE` 约束 | 节点组时间区间不重叠（节点分时上线场景） |
| 扩展生态 | `pg_trgm`（模糊搜索）、`pg_stat_statements`（慢查询） |

### 为什么不用 MySQL

不是不能用，是这个项目里 PG 的 JSONB 与分区表能省掉大量应用层代码；如果团队已有 MySQL 运维经验，可以换成 MySQL 8，但需要放弃 JSONB 索引与部分索引的等价优化。

### Drizzle 而不是 Prisma

- 无引擎、无 Rust 二进制，部署简单
- SQL-first：复杂查询（报表、聚合）直接写 SQL，不被 DSL 限制
- 类型推导在编译期，运行时零开销（性能敏感路径友好）
- 迁移可手写 SQL 修正（生产迁移自由度更高）

## 4. 为什么 Agent 用 Go 而不是 TypeScript

| 维度 | Go | TS（Bun/Deno/Node） |
|---|---|---|
| 分发 | 单静态二进制，scp 上去就能跑 | 需要目标环境有运行时（OpenWrt/软路由是老大难） |
| 交叉编译 | 原生支持 6 平台 | 需要各平台 runtime 打包 |
| 常驻内存 | ~10-20MB | 30-100MB |
| 冷启动 | ms 级 | 100ms+ |
| 生态契合 | 与 sing-box/Xray 同语言，进程管理/协议熟悉 | 需要额外胶水 |

结论：Agent 用 Go；跨端一致性靠 **OpenAPI 生成**保证，不靠共享运行时。

## 5. 认证方案

| 场景 | 方案 |
|---|---|
| 用户/管理员 | `nuxt-auth-utils` 加密 cookie 会话 + RBAC 权限点 |
| 用户 API Token | `personal_access_tokens` 表，存 hash，前缀 `spx_`，scope 控制 |
| 节点 | `node_secret` + HMAC-SHA256 请求签名（见 [api-design](api-design.md)） |
| 插件 | 每个插件独立 token，可撤销、可限权、可单独审计 |

密码哈希：`nuxt-auth-utils` 自带 scrypt；若需要 argon2id，用 `@node-rs/argon2`（预编译二进制，无 node-gyp 依赖）。

## 6. 队列

**BullMQ + Redis**（与缓存同一实例，不同 prefix）。理由：

- 支付回调后的异步动作、流量落库、邮件通知、插件同步都适合
- 自带重试、退避、死信、并发控制
- 相比 `pg-boss`：生态更成熟、监控工具（Bull Board）现成

降级：Redis 不可用时，任务直接内联执行（同步），保证功能不丢。

## 7. 工具链

用 **mise** 管理版本（与项目 AGENTS.md 约定一致）：

```toml
# mise.toml
[tools]
node = "24.11"
pnpm = "12.14.0"
go = "1.24"
postgresql = "17"
redis = "7"
```

## 8. 明确不引入的东西

| 不引入 | 原因 |
|---|---|
| Pinia | Nuxt `useState` + `createSharedComposable` 已足够，少一层依赖 |
| Tailwind UI / Headless UI | Nuxt UI 已基于 Reka UI 提供无障碍组件 |
| 自建 RBAC 库 | `@nuxt/ui` 无 RBAC，但实现只需 200 行，放 `server/utils/auth.ts` |
| Prisma | 见上 |
| Kubernetes Helm | 过度设计，compose 足够；k8s 清单留到有人真要跑 k8s 时再写 |
| 微服务拆分 | 单体 Nuxt 足够，边界靠目录与模块划分 |
