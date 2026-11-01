# Sparrow Proxy Panel

自托管代理服务运营面板：Panel 负责售卖、配额、订阅与节点管控；Agent 部署在节点上承载流量并上报。

Next.js 16（App Router）+ React 19 + TypeScript + Tailwind 4 + shadcn/ui + Drizzle + PostgreSQL 17 + Go 1.24（Agent）。

## 目录

```
src/panel/            Next.js 全栈应用：页面 + /api/v1 + 定时任务
src/agent/            Go Agent：注册/心跳/配置/流量/命令/自更新
packages/contracts/   跨端契约：zod 类型与权限点
deploy/               部署物：compose、Dockerfile 引用、脚本、Caddy 模板
docs/                 产品 / 架构 / 前端 / 部署文档
```

## 本地开发

```bash
mise install                 # node 24 / pnpm / go / postgres
pnpm install

# 1. 数据库（已有 sparrow-postgres 容器可跳过）
docker network create web 2>/dev/null || true
docker compose -f deploy/compose.yaml up -d postgres

# 2. 环境变量
cd src/panel && cp .env.example .env

# 3. 建表
pnpm db:migrate

# 4. 起服务
cd ../.. && pnpm dev          # http://localhost:3000
```

首次访问 `/setup` 创建管理员；想直接要演示数据则 `pnpm --filter panel db:seed`
（**会清空表**），种子账号：

| 角色 | 账号 | 密码 |
|---|---|---|
| 超级管理员 | `admin@example.com` | `sparrow` + `2026`（拼起来，11 位） |
| 普通用户 | `lily@example.com` | `lily` + `2026`（8 位） |

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` / `build` / `start` | 开发 / 构建 / 生产启动 |
| `pnpm typecheck` / `lint` | 类型与 Lint |
| `pnpm --filter panel check:layers` | 后端分层门禁（route 不得直连 DB） |
| `pnpm --filter panel db:generate` / `db:migrate` / `db:seed` | 迁移生成 / 应用 / 重置演示数据 |
| `pnpm --filter panel db:studio` | Drizzle Studio |
| `pnpm agent:build` / `agent:test` | 编译 Agent / 跑 Go 测试 |
| `deploy/build-agent.sh` | 交叉编译 amd64/arm64/armv7 + 生成 `latest.json`，面板对外分发 |

## 生产部署

宿主机只需要 Docker（数据库、应用、HTTPS 都在容器里）：

```bash
# 1. 远端装环境（可选 --swap / --firewall）
ssh root@<服务器> 'bash -s -- --swap' < deploy/bootstrap.sh

# 2. 起服务
git clone git@github.com:define9/sparrow-proxy-panel.git /opt/sparrow/app
cd /opt/sparrow/app/deploy && sudo ./up.sh --domain panel.example.com
```

已有统一 Caddy / Nginx 时用：

```bash
sudo ./up.sh --no-caddy --domain panel.example.com   # 只跑 DB + 面板，反代到 127.0.0.1:3000
```

完整步骤（初始化、备份、升级、排障、节点接入）见 **[docs/deploy-ubuntu.md](docs/deploy-ubuntu.md)**。

## 文档

- 索引：[docs/README.md](docs/README.md)
- 进度（唯一记录）：[docs/roadmap.md](docs/roadmap.md)
- 后端分层：[docs/architecture/backend-layers.md](docs/architecture/backend-layers.md)

> 文档里的 `panel.example.com` 是占位符，替换成你的域名。
