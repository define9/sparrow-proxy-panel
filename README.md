# Sparrow Proxy Panel

自托管代理服务运营面板：Panel 负责售卖、配额、订阅与节点管控，Agent 部署在节点上承载流量并上报。

技术栈：Next.js 16（App Router）+ React 19 + TypeScript + Tailwind 4 + shadcn/ui + Drizzle ORM + PostgreSQL 17。
产品与架构设计见 [docs/](docs/README.md)。

## 目录

```
src/panel/          # Next.js 全栈应用（页面 + /api/v1 + 定时任务）
packages/contracts/ # 跨端契约：zod schema、权限点、核心类型
deploy/             # docker compose（PostgreSQL）
docs/               # 产品 / 架构 / 前端文档
```

## 本地启动

```bash
mise install          # node 24 / pnpm / postgres 工具链
pnpm install

# 1. 数据库（已有 sparrow-postgres 容器可跳过）
docker compose -f deploy/compose.yaml up -d

# 2. 环境变量
cd src/panel && cp .env.example .env

# 3. 建表 + 种子数据
pnpm db:migrate
pnpm db:seed

# 4. 起开发服务
cd ../.. && pnpm dev        # http://localhost:3000
```

种子账号：

| 角色 | 账号 | 密码 |
|---|---|---|
| 超级管理员 | `admin@example.com` | `admin123456` |
| 普通用户 | `lily@example.com` | `user123456` |

登录后管理端在 `/admin`，用户端在 `/dashboard`。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发服务（Turbopack） |
| `pnpm build` | 生产构建（`output: standalone`） |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm lint` | ESLint |
| `pnpm --filter panel db:generate` | 改完 schema 后生成迁移 |
| `pnpm --filter panel db:migrate` | 应用迁移 |
| `pnpm --filter panel db:seed` | 重置并写入演示数据（**会清空表**） |

## 环境变量

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串（运行时与 drizzle-kit 共用） |
| `MASTER_KEY` | 节点私钥 / 插件密钥 / 2FA 密钥的加密主密钥 |
| `NEXT_PUBLIC_SITE_URL` | 对外地址（生成订阅链接、支付回调地址） |

## 当前进度

以 [docs/roadmap.md](docs/roadmap.md) 的勾选为准。已落地：工程脚手架、设计系统与全部页面骨架、
数据模型与迁移、自建会话与 RBAC、商品/订单/支付（演示网关）/订阅接口、节点管理与 Agent 协议、
统计与订阅输出。
