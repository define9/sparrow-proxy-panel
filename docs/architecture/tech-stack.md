# 技术选型

一个 Next.js 全栈应用同时承载页面与 API；UI 用 shadcn/ui（源码进仓库，不是组件库依赖）。
下表只声明**主版本**，精确版本由 `pnpm-lock.yaml` 锁定，升级走 Renovate。

## 1. 为什么是 Next.js + shadcn/ui

| 维度 | 结论 |
|---|---|
| 全栈形态 | App Router 的 Route Handlers + Server Components，一个产物同时跑页面与 `/api/v1`，不用再挂一层网关 |
| 服务端渲染 | 不强求 SSR：后台页面走 CSR，首屏用 `Suspense` + `Skeleton`；只有公开页按需 RSC/ISR 拿 SEO |
| UI | shadcn 把组件源码复制进 `components/ui/`，改样式不用跟库斗；没有大版本升级断层 |
| 无障碍 | 底层 Radix primitives，焦点、键盘、ARIA 开箱可用 |
| 样式 | Tailwind CSS 4 + CSS 变量，换主题只改 `globals.css` |
| 生态 | TanStack Table/Query、react-hook-form、Recharts、cmdk 都有官方 shadcn recipe，不用自研 |

不选 Nuxt：项目没有 Vue 存量，团队 React 经验更足；shadcn 的组件粒度比 Nuxt UI 更贴合"后台系统要改哪里就改哪里"。
不选 Remix/React Router 框架模式：本项目页面与接口同仓同进程，Next 的 RSC 与路由约定更省事。

## 2. 版本清单

### 2.1 应用

| 包 | 主版本 | 用途 |
|---|---|---|
| `next` | ^16 | App Router、RSC、Route Handlers |
| `react` / `react-dom` | ^19 | — |
| `typescript` | ^5 | — |
| `tailwindcss` | ^4 | `@theme` + CSS 变量 |
| `shadcn`（CLI） | latest | 生成 `components/ui/*`，不产生运行时依赖 |
| `radix-ui` | ^1 | shadcn 组件的底层 primitives |
| `lucide-react` | ^0.5 | 图标（按需 import，随包构建） |
| `next-themes` | ^0.4 | 明暗模式 |
| `sonner` | ^2 | toast |

### 2.2 数据、表单与图表

| 包 | 主版本 | 用途 |
|---|---|---|
| `@tanstack/react-query` | ^5 | 客户端数据获取、缓存、失效 |
| `@tanstack/react-table` | ^8 | 表格（shadcn Data Table recipe） |
| `react-hook-form` + `@hookform/resolvers` | ^7 | 表单 |
| `zod` | ^4 | 校验（与 `packages/contracts` 同一套 schema） |
| `recharts` | ^2 | 图表（shadcn Chart recipe） |
| `cmdk` | ^1 | 命令面板 |

### 2.3 服务端

| 包 | 主版本 | 用途 |
|---|---|---|
| `drizzle-orm` | ^0.44 | ORM（SQL-first，零运行时开销） |
| `drizzle-kit` | ^0.31 | 迁移生成（dev） |
| `pg` | ^8 | PostgreSQL 驱动 |
| `@node-rs/argon2` | ^2 | 密码哈希（预编译二进制，无 node-gyp） |
| `next-intl` | ^4 | 多语言 |
| `zod-openapi` | ^5 | zod → OpenAPI 3.1（契约生成） |
| `node-cron` | ^4 | 进程内定时任务 |

### 2.4 开发工具

| 包 | 主版本 | 用途 |
|---|---|---|
| `eslint` + `eslint-config-next` | ^9 / ^16 | 扁平配置 |
| `eslint-plugin-better-tailwindcss` | ^4 | 类名排序校验 |
| `vitest` | ^3 | 单元测试 |
| `@testing-library/react` | ^16 | 组件测试 |

### 2.5 Agent CLI（Go）

| 组件 | 版本 | 说明 |
|---|---|---|
| Go | 1.24+ | 单静态二进制（CGO 关闭） |
| `oapi-codegen` | v2 | 从 OpenAPI 生成 Go 客户端 |
| `yaml.v3` | v3 | Agent 配置解析 |
| 其他 | — | 无第三方依赖；HTTP 用 `net/http`，日志用 `log/slog` |

## 3. 数据库

**PostgreSQL 17**，相对 MySQL 8 的关键差异都用得上：

| 能力 | 用途 |
|---|---|
| JSONB + GIN | 插件配置、节点扩展字段、订单快照 |
| 窗口函数 / 递归 CTE | 流量排行、节点组树 |
| 部分索引 | `WHERE status = 'active'` 的热路径 |
| 按日分区 | `traffic_logs` 百万级/天，超期分区直接 DROP |
| advisory lock | 多副本定时任务选主、迁移互斥 |
| `pg_trgm` | 模糊搜索 |

**Drizzle 而不是 Prisma**：无引擎与 Rust 二进制，部署只有一个 Node 进程；SQL-first，报表类聚合直接写 SQL；类型推导在编译期，运行时零开销；迁移可手写 SQL 修正。

### 为什么不是 SQLite

SQLite 的吸引力是"零运维、单文件"，在这个项目里恰好被三个硬需求抵消：

| 需求 | SQLite | PostgreSQL |
|---|---|---|
| 1000 节点 × 30s 心跳 + 30s 流量批量 UPSERT | WAL 下写仍全局串行，高并发写会排队 | 行级锁，多连接真正并行 |
| `traffic_logs` 按天裁剪 | 无声明式分区，只能 DELETE + VACUUM | `PARTITION BY RANGE`，超期直接 DROP |
| 定时任务多副本选主 | 无 advisory lock，只能靠文件锁 | `pg_try_advisory_lock` |
| 插件 manifest / 订单快照查询 | JSON1 扩展，索引能力弱 | JSONB + GIN |
| 金额精度 | `REAL` 有浮点风险，需自建 decimal | 原生 `numeric(12,2)` |
| 将来上多副本 | 必须共享文件系统（不可行） | 会话在库里，直接加副本 |

结论：**PostgreSQL 17**。部署成本并不高——compose 里多一个容器，单机单库；换来的是并发写、分区、锁原语都现成。

什么时候该反过来选 SQLite：单管理员自用、没有规模化节点、或要做成"下载即用的桌面版"。那时用 PGlite（WASM 版 PG）比换 SQLite 更划算，SQL 与迁移脚本都不用重写。

> 不维护"开发用 SQLite、生产用 PG"的双驱动：方言差异（分区、JSONB、`ON CONFLICT`、`RETURNING`）会让测试与生产的 SQL 分叉，得不偿失。

## 4. 为什么 Agent 用 Go

单静态二进制可直接 scp 到 OpenWrt/软路由（没有 Node 运行时），常驻内存 ~20MB，与 sing-box / Xray 同语言便于进程管理与统计读取。
跨端一致性靠 **OpenAPI 生成**保证，不靠共享运行时。

## 5. 认证方案

| 场景 | 方案 |
|---|---|
| 用户 / 管理员 | 自建会话（`lib/auth/session.ts`）：cookie 里放 32 字节随机 id，`sessions` 表存 SHA-256 哈希 + RBAC 权限点 |
| 用户 API Token | `personal_access_tokens` 表，只存 hash，前缀 `spx_`，scope 控制 |
| 节点 | `node_secret` + HMAC-SHA256 请求签名（见 [api-design](api-design.md)） |
| 插件 | 每插件独立 token，可撤销、可限权、可单独审计 |

> 不用 Auth.js：它的 Credentials provider 只支持 JWT 会话，与"强制下线 / 设备列表"冲突。
> 本项目的认证形态只有邮箱+密码与 TOTP，自建会话约 200 行，行为完全可控，也少了边缘运行时适配。

密码哈希 Argon2id（`@node-rs/argon2`），参数 m=64MB、t=3、p=1。

## 6. 定时任务（不引入 MQ）

Next 没有内置调度器，本项目按**常驻进程**部署，任务在 `instrumentation.ts` 启动：

- `register()` 里判断 `process.env.NEXT_RUNTIME === 'nodejs'` 再启 node-cron，避免 edge runtime 报错
- 多副本时每个任务先 `pg_try_advisory_lock` 抢锁，拿不到就跳过
- 耗时任务写 `task_runs` 表 + 轮询状态，不占用请求线程
- 支付回调同步处理（验签 + 开通通常 < 100ms）

> 这套方案依赖常驻进程，**不能部署到纯 Serverless 平台**（函数会被冻结）。

## 7. 工具链

用 **mise** 管理版本：

```toml
# mise.toml
[tools]
node = "24"
pnpm = "10"
go = "1.24"
postgresql = "17"
```

## 8. 明确不引入

| 不引入 | 原因 |
|---|---|
| 第三方 admin 模板 | shadcn blocks 已覆盖 sidebar / table / form，模板只会带来升级负担 |
| Redux / Zustand | 服务端状态交给 RSC + TanStack Query；客户端状态用 Context 与 `useState` 足够，出现真实跨页状态再局部引入 |
| Prisma | 见上 |
| Redis / MQ | 单机单体，缓存、限流、验证码用进程内存 |
| Kubernetes | compose 足够，k8s 清单留到有人真要跑时再写 |
| 微服务拆分 | 单体够用，边界靠 `lib/` 目录与服务层划分 |
