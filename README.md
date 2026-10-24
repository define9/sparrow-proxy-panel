# Sparrow Proxy Panel

自托管代理服务运营面板：**Panel**（Nuxt 全栈，用户端 + 管理端）+ **Agent**（Go CLI，部署在节点上）。

```
sparrow-proxy-panel/
├── src/panel/          Nuxt 全栈面板（Nuxt 4 + Nuxt UI 4 + PostgreSQL 17）
├── src/agent/          Go 单二进制节点代理 CLI
├── packages/contracts/ 跨端契约源（zod → OpenAPI → Go client）
├── packages/config/    共享 TypeScript 配置
├── docs/               产品与技术文档 ← 先读这里
├── deploy/             容器编排（规划中）
└── .github/workflows/  CI（lint / typecheck / 契约漂移 / 构建）
```

## 环境准备

```bash
mise trust          # 信任仓库内的 mise.toml
mise install        # node / pnpm / go
```

PostgreSQL 17 使用本机全局安装的版本（未写进项目 `mise.toml`）。

> 当前是**单机单体**架构：应用 + PostgreSQL 两个组件，不需要 Redis / MQ。

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp src/panel/.env.example src/panel/.env
#   至少设置 NUXT_DATABASE_URL / NUXT_SESSION_PASSWORD / NUXT_MASTER_KEY

# 3. 初始化数据库（迁移 + 种子数据）
pnpm db:migrate
pnpm db:seed

# 4. 启动
pnpm dev             # 面板 http://localhost:3000
```

种子脚本会创建 `superadmin` 账号（默认邮箱见 `drizzle/seed.ts`，密码 `admin12345`，**生产务必修改**）。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动面板开发服务器 |
| `pnpm dev:agent` | 运行 Agent CLI（`src/agent`） |
| `pnpm build` | 构建面板 |
| `pnpm lint` / `pnpm typecheck` | 规范 / 类型检查（Turbo 编排） |
| `pnpm gen` | 由 `packages/contracts` 生成 `openapi.json` |
| `pnpm gen:check` | **契约漂移检测**（CI 门禁） |
| `pnpm db:generate` | 生成 Drizzle 迁移 |
| `pnpm db:check` | **迁移漂移检测**（CI 门禁） |
| `pnpm db:migrate` / `pnpm db:seed` | 执行迁移 / 写入种子数据 |
| `pnpm db:studio` | 打开 Drizzle Studio |

## 当前进度

| 模块 | 状态 |
|---|---|
| Monorepo 骨架（pnpm workspaces + Turbo + Go module） | ✅ |
| 跨端契约（zod schema + OpenAPI 生成 + 24 个权限点） | ✅ |
| 数据模型（33 张表 + 28 个枚举，迁移已生成并验证） | ✅ |
| 登录与会话（scrypt 口令哈希 + 加密 Cookie 会话 + RBAC） | ✅ |
| 前端骨架（4 种布局 / 权限驱动菜单 / 明暗模式 / 中英文） | ✅ |
| Agent CLI | 仅骨架（`src/agent`） |
| 商品 / 订单 / 订阅 / 节点 / 插件 | 待实现 |

## 文档

全部设计文档在 [`docs/`](docs/README.md)，从 [文档索引](docs/README.md) 开始读。

核心结论：

- **Monorepo** 而非 multirepo —— 面板与 Agent 共享一份契约，契约漂移由 CI 拦截（[ADR-0001](docs/architecture/monorepo-layout.md)）
- **PostgreSQL + Drizzle** —— JSONB、分区表、窗口函数，扩展性强
- **Go 写 Agent** —— 单静态二进制，适配 OpenWrt/软路由等各类节点环境
- **最大化使用 Nuxt UI 原生能力** —— 语义颜色、`UNavigationMenu` 菜单、`UDashboardSearch` 命令面板、`@nuxtjs/i18n` 多语言（[前端文档](docs/frontend/frontend-architecture.md)）

## License

待定
