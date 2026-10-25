# Sparrow Proxy Panel

自托管代理服务运营面板：**Panel**（Nuxt 全栈，用户端 + 管理端）+ **Agent**（Go CLI，部署在节点上）。

```
sparrow-proxy-panel/
├── src/panel/          Nuxt 全栈面板（Nuxt 4 + Nuxt UI 4 + PostgreSQL）
├── src/agent/          Go 单二进制节点代理 CLI
├── packages/contracts/ 跨端契约源（zod → OpenAPI → Go client）
├── packages/config/    共享 TypeScript 配置
├── docs/               产品与技术文档 ← 先读这里
└── .github/workflows/  CI（lint / typecheck / 测试 / 契约漂移 / i18n 冒烟）
```

## 需要启动哪些服务？

**只有一个：PostgreSQL 17。**（本项目是单机单体，不需要 Redis / MQ / Kafka。）

### 一键启动数据库

```bash
./scripts/pg.sh start     # 初始化 + 启动（数据目录 ~/Library/Application Support/sparrow-pg）
./scripts/pg.sh status    # 查看状态与表数量
./scripts/pg.sh stop      # 停止
./scripts/pg.sh reset     # 清库重建
./scripts/pg.sh psql      # 连到 sparrow 库
```

脚本会：初始化数据目录 → 启动 PG（端口 5432）→ 自动创建 `sparrow` 库。
数据目录放在 `~/Library/Application Support/sparrow-pg`（**不在系统临时目录里，重启机器不会丢**）。

> 已有 PostgreSQL 的话跳过脚本，直接改 `src/panel/.env` 的 `DATABASE_URL` 即可
> （Docker 版：`docker run -d -p 5432:5432 -e POSTGRES_USER=sparrow -e POSTGRES_PASSWORD=sparrow -e POSTGRES_DB=sparrow postgres:17`）。

### 初始化并启动面板

```bash
# 1) 配置环境变量
cp src/panel/.env.example src/panel/.env
#   至少改这两项：
#     DATABASE_URL=postgresql://sparrow@127.0.0.1:5432/sparrow
#     NUXT_SESSION_PASSWORD=<至少 32 字符，session 加密密钥>
#   生成会话密钥：node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 2) 初始化数据库（33 张表 + 角色/权限/管理员/示例商品）
pnpm db:migrate
pnpm db:seed

# 3) 启动
pnpm dev            # http://localhost:3000
```

默认管理员：**`admin@example.com` / `admin12345`**（`drizzle/seed.ts` 里的默认值，**生产务必改**）。

> `src/panel/.env` 已加入 `.gitignore`。只写 `DATABASE_URL` 一个变量即可，drizzle-kit 与运行时共用。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动面板开发服务器 |
| `pnpm dev:agent` | 运行 Agent CLI（`src/agent`） |
| `pnpm build` / `pnpm preview` | 构建 / 本地预览生产产物 |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | 规范 / 类型 / 单元测试 |
| `pnpm gen` | 由 `packages/contracts` 生成 `openapi.json`（改契约后必须跑） |
| `pnpm gen:check` | **契约漂移检测**（CI 门禁） |
| `pnpm db:generate` / `pnpm db:check` | 生成迁移 / **迁移漂移检测**（CI 门禁） |
| `pnpm db:migrate` / `pnpm db:seed` | 执行迁移 / 写入种子数据 |
| `pnpm db:studio` | 打开 Drizzle Studio |
| `pnpm --filter @sparrow/panel smoke:i18n` | 逐页检查 i18n 裸 key（需要先 build） |

## 两个容易踩的坑（已修，勿回退）

**1. i18n 显示裸 key（`nav.login` / `home.hero.title`）**

`@nuxtjs/i18n` v10 的 `experimental.preload` 默认是 `false`：服务端渲染的文案**不会**随 payload 下发客户端，而客户端 bundle 里又没有打包 locale JSON → hydration 之后全部退回裸 key（表现为"内容一闪而过，最后还是 key"）。

修复：`nuxt.config.ts` 里开启 `i18n.experimental.preload = true`。
回归防护：`tests/i18n/keys.test.ts`（静态断言 key 存在 + 中英文一致）+ `tools/smoke-i18n.mjs`（逐页扫描裸 key，已进 CI）。

**2. 登录报 `Password string too short (min 32 characters required)`**

`nuxt-auth-utils` 要求 `NUXT_SESSION_PASSWORD` **至少 32 字符**，否则所有需要会话的接口 500。

## 当前进度

| 模块 | 状态 |
|---|---|
| Monorepo 骨架（pnpm workspaces + Turbo + Go module） | ✅ |
| 跨端契约（zod schema + OpenAPI 生成 + 24 个权限点） | ✅ |
| 数据模型（33 表 / 28 枚举） | ✅ |
| 登录与会话（scrypt + 加密 Cookie + RBAC） | ✅ |
| 商品 + 订单（用户端 + 管理端） | ✅ |
| 订阅管理 + 多格式渲染器（v2ray/clash/sing-box） | ✅ |
| 节点管理 + 内核配置渲染（sing-box / xray） | ✅ |
| 插件宿主 + 插件管理 | ✅ |
| Agent CLI（注册/心跳/配置/流量/命令） | ✅ |
| 支付回调 / 注册流程 / 2FA / 用户管理 / 日志 | 待实现 |

## 文档

全部设计文档在 [`docs/`](docs/README.md)，从 [文档索引](docs/README.md) 开始读。

核心结论：

- **Monorepo** 而非 multirepo —— 面板与 Agent 共享一份契约，契约漂移由 CI 拦截（[ADR-0001](docs/architecture/monorepo-layout.md)）
- **单机单体**：应用 + PostgreSQL，不引入 Redis / MQ（[overview](docs/architecture/overview.md)）
- **PostgreSQL + Drizzle** —— JSONB、分区表、窗口函数，扩展性强
- **Go 写 Agent** —— 单静态二进制，适配 OpenWrt/软路由等各类节点环境
- **最大化使用 Nuxt UI 原生能力** —— 语义颜色、`UNavigationMenu` 菜单、`UDashboardSearch` 命令面板、`@nuxtjs/i18n` 多语言（[前端文档](docs/frontend/frontend-architecture.md)）

## License

待定
