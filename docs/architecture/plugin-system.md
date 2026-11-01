# 插件系统设计

## 1. 目标与边界

**目标**：让"支付网关、节点来源、订阅格式、通知渠道、定时任务"这类**会频繁变化**的能力，不改面板核心代码就能接入；并让社区作者在自己的仓库里开发，管理员**填一个 git URL 就能安装**。

**非目标**：插件**不能**执行任意代码在面板主进程内、不能读写未经授权的数据、不能绕过 RBAC、不能把自己的前端 bundle 注入主应用。

## 2. 两层运行时

| 层 | 运行位置 | 适用 | 特点 |
|---|---|---|---|
| **内置插件** | 面板进程内 | 官方能力（易支付、Telegram） | 编译进产物，类型安全，零启动开销 |
| **外置插件** | 独立进程（HTTP） | 社区插件（git URL 安装） | 崩溃不影响面板；可独立发版；权限与网络受控 |

**默认策略**：社区插件一律外置运行。内置插件是"白名单例外"，随面板版本发布。

外置插件与面板的通信：

```
面板  ──HTTP POST──►  插件进程（127.0.0.1:{port}） /hook/{hookName}
插件  ──HTTP──►  面板 /api/v1/plugin/callback/{pluginKey}
```

面板调用插件时使用**每个插件独立的 token**，并在请求头带上上下文：

```
Authorization: Bearer <plugin_token>
X-Sparrow-Plugin: <plugin_key>
X-Sparrow-Run-Id: <uuid>                                  # 幂等键（定时任务必带）
X-Sparrow-Signature: HMAC-SHA256(<plugin_token>, body)   # 防篡改/重放
```

进程由 `lib/plugin-host/supervisor.ts` 在 `instrumentation.ts` 里拉起，见 §6.5。

## 3. 插件清单（manifest）

插件声明是一个 JSON（TypeScript 源码可选），schema 定义在 `packages/contracts/src/plugin/manifest.ts`：

```jsonc
{
  "key": "payment-epay",              // 唯一标识，小写 + 连字符
  "name": "易支付",
  "version": "1.2.0",
  "type": "payment",                  // payment | node_source | subscription | notify | hook | ui
  "description": "对接易支付聚合网关",
  "author": "some-community-dev",

  "runtime": "external",              // external | builtin（builtin 仅官方）
  "entry": "dist/index.js",           // 相对仓库根（或 subdir）的启动入口
  "build": "none",                    // none = 仓库自带产物；npm = 需要构建（默认禁止，见 §6.3）

  "permissions": [
    "order:read", "order:write",
    "settings:read"
  ],
  "egress": ["api.epay.example.com"], // 运行期允许访问的外部域名

  "hooks": ["order.created", "order.paid", "payment.callback"],
  "schedules": [                       // 声明式定时任务，见 §5
    { "key": "reconcile", "cron": "*/5 * * * *", "handler": "payment.reconcile", "timeoutMs": 30000 }
  ],

  "configSchema": {                    // JSON Schema，面板据此自动生成配置表单
    "type": "object",
    "properties": {
      "pid": { "type": "string", "title": "PID", "required": true },
      "key": { "type": "string", "title": "商户密钥", "secret": true }
    }
  },

  "ui": {
    "mode": "schema",                  // schema = 只渲染配置表单；iframe = 插件自带页面（沙箱）
    "nav": { "label": "插件设置", "icon": "Plug" }
  },

  "signature": "ed25519:…",           // 可选；社区插件通常没有，见 §6.6
  "compatibility": { "panel": ">=0.1.0 <1.0.0" }
}
```

要点：
- `configSchema` 用 JSON Schema → `json-schema-to-zod` 转 zod → shadcn `Form` + react-hook-form **自动生成配置表单**，插件不需要写前端
- `permissions` 是插件能调用面板 API 的上限，安装时逐条确认；运行期可降不可升
- `secret: true` 的字段在面板侧加密存储，API 返回时脱敏
- `schedules` 是**声明式**定时任务，核心物化到 `plugin_jobs`（见 §5）；插件不在运行时注册 cron，重启或升级都不会丢
- `egress` 是安装时写入白名单的出网域名，插件进程只能访问这些域名
- **`ui.mode` 只有 schema 与 iframe 两种**：不允许插件把自己的前端 bundle 注入主应用（同源 = 拥有管理员会话）

## 4. Hook 目录

面板在关键业务点触发 hook。hook 是**同步或异步**的，由 manifest 声明：

| Hook | 时机 | 入参 | 返回 |
|---|---|---|---|
| `user.registered` | 注册成功 | `{ user }` | void |
| `user.login` | 登录成功 | `{ user, ip }` | void |
| `order.created` | 下单成功 | `{ order, plan, user }` | `{ amount }`（可改价，需权限） |
| `order.paid` | 支付成功 | `{ order, payment }` | void |
| `order.expired` | 订单超时 | `{ order }` | void |
| `subscription.created` | 订阅开通 | `{ subscription, plan }` | void |
| `subscription.expiring` | 即将到期（定时） | `{ subscription }` | void |
| `subscription.render` | 渲染订阅 | `{ subscription, format, defaultBody }` | `{ body, contentType }` |
| `node.source.fetch` | 拉取三方节点源 | `{ source, params }` | `{ nodes: [...] }` |
| `node.config.render` | 渲染节点内核配置 | `{ node, defaultConfig }` | `{ config }` |
| `payment.gateway` | 发起支付 | `{ order, gateway }` | `{ payUrl, qrcode }` |
| `payment.callback` | 支付回调 | `{ gateway, payload }` | `{ verified, tradeNo }` |
| `notification.send` | 发送通知 | `{ channel, template, payload }` | void |
| `telemetry.report` | 上报数据到三方 | `{ event, payload }` | void |

调用规则：

1. **超时**：默认 3s（可按 hook 配置，最长 15s），超时记 `plugin_events` 并继续主流程
2. **熔断**：同一插件连续 5 次失败 → 自动禁用 10 分钟，告警
3. **顺序**：按插件安装顺序串行调用（保证结果确定），同 hook 内可并行
4. **幂等**：hook 收到的事件 ID，需支持重复投递
5. **失败策略**：关键 hook（`order.paid`、`payment.callback`）失败 → 订单进入 `pending_review`，人工介入，不静默丢单

## 5. 插件调度（定时任务）

插件可以声明"我要每 N 分钟跑一次"，但**不是**在运行时调 API 注册 cron——那会在重启后丢失、禁用后残留、升级后漂移。采用 **声明式 + 协调（reconcile）**：

```
manifest.schedules  ──安装/启用/启动时 reconcile──►  plugin_jobs 表  ──统一 ticker 扫到期──►  执行器
      （期望状态）                                      （实际状态）                          builtin / external
```

### 5.1 声明与物化

```jsonc
"schedules": [
  { "key": "sync-nodes",  "cron": "*/5 * * * *", "handler": "node.source.sync", "timeoutMs": 30000 },
  { "key": "daily-report", "cron": "0 3 * * *",  "handler": "report.daily",     "tz": "Asia/Shanghai" }
]
```

reconcile 在三个时机执行，逻辑相同（幂等 upsert + 删除多余行）：

| 时机 | 动作 |
|---|---|
| 应用启动（`instrumentation.ts`） | 读所有 `status = 'installed'` 的插件 manifest，物化到 `plugin_jobs` |
| 安装 / 启用 / 升级插件 | 同上，只处理该插件 |
| 卸载 / 禁用插件 | 该插件 `plugin_jobs` 置 `enabled = false` 或删除 |

表里只存"下一条什么时候跑"，不存 cron 之外的东西：

```
plugin_jobs(id, plugin_key, job_key, cron, handler, payload jsonb, enabled, next_run_at, last_run_at, last_status)
唯一键 (plugin_key, job_key)
```

### 5.2 执行：一个 ticker，不是每插件一个 cron

```ts
// instrumentation.ts 启动一次
cron.schedule('* * * * *', () => withLock('jobs:tick', runDueJobs))

// lib/jobs/run-due.ts
const due = await db.execute(sql`
  SELECT j.* FROM plugin_jobs j
  WHERE j.enabled
    AND j.next_run_at <= now()
    -- 上一个同任务还在跑就跳过，天然串行
    AND NOT EXISTS (
      SELECT 1 FROM plugin_job_runs r
      WHERE r.job_id = j.id AND r.status = 'running'
    )
  ORDER BY j.next_run_at
  LIMIT 50
  FOR UPDATE OF j SKIP LOCKED`)

for (const job of due) {
  const [run] = await db.insert(pluginJobRuns)
    .values({ jobId: job.id, status: 'running' })
    .returning({ runId: pluginJobRuns.runId })

  await db.update(pluginJobs).set({ nextRunAt: nextCron(job.cron, now), lastRunAt: now })

  void runner.invoke(job, run.runId)   // 内部更新 run 状态与耗时，不阻塞 tick
}
```

好处：

- **重启安全**：`next_run_at` 在库里，进程重启后到下个整分自动续上；停机期间错过的多次只补跑一次（`catch_up` 语义）
- **多副本安全**：`FOR UPDATE SKIP LOCKED` + `pg_try_advisory_lock('jobs:tick')`，同一任务不会被两个进程同时捞到
- **不随插件数量膨胀**：100 个插件只有 1 个 cron 表达式，不会因为禁用/卸载留下僵尸定时器
- **立即生效**：管理员禁用插件，下一个 tick 就跳过了（`enabled = false`）
- **崩溃自愈**：每次 tick 先把 `status = 'running' AND started_at < now() - 10min` 的孤儿记录置为 `timeout`，否则一个崩溃的 run 会把该任务永久卡住

### 5.3 执行器抽象

`runner.invoke(job: PluginJob, runId: string)` 有两种实现，对上层无差别：

| 插件类型 | 执行方式 |
|---|---|
| `builtin` | 查 `lib/plugin-host/builtin/{pluginKey}.ts` 导出的 handler map，同进程直接调 |
| `external` | `POST {plugin.entry}/hook/{handler}`，带 `Authorization: Bearer <plugin_token>` + HMAC 签名 + `X-Run-Id` |

内置插件就是源码里的一个文件，注册表长这样：

```ts
// lib/plugin-host/builtin/index.ts
export const builtinHandlers = {
  'core.traffic': { 'traffic.flush': flushTraffic, 'traffic.rollup': rollupTraffic },
  'payment-epay': { 'payment.reconcile': reconcileEpay }
}
```

核心自己的定时任务（流量刷入、订单过期、节点健康）也走同一套 `plugin_jobs`，只是 `plugin_key = 'core.*'`——不必维护两套调度代码。

### 5.4 语义与约束

| 项 | 约定 |
|---|---|
| 投递语义 | **at-least-once**：崩溃可能重跑，handler 必须用 `runId` 做幂等 |
| 超时 | 默认 30s（manifest 可配，最长 5min）；超时记 `plugin_job_runs` 并算一次失败 |
| 失败重试 | 默认不自动重试（等下一个 cron 周期）；关键任务可在 manifest 里配 `retry: { attempts: 3, backoff: 'exponential' }` |
| 并发 | 同一 `(plugin_key, job_key)` 串行，不重叠执行（上一次没跑完则本次跳过并记 `skipped`） |
| 熔断 | 连续 5 次失败自动 `enabled = false` + 告警，管理员手动恢复 |
| 长任务 | `timeoutMs > 60s` 的任务应拆成"入队 + 分批处理"，不要占用 ticker |
| 时区 | 默认服务器 TZ；需要固定时区的任务显式写 `tz` |

## 6. 从 Git URL 安装

目标：社区插件放在作者自己的仓库里，管理员在后台**填一个 URL 就能装**，不需要我们做中心化仓库或人工上架。

### 6.1 支持的 URL 形态

| 形态 | 示例 |
|---|---|
| 默认分支最新提交 | `https://github.com/foo/sparrow-plugin-epay` |
| 指定 tag / 分支 | `https://github.com/foo/sparrow-plugin-epay#v1.2.0` |
| 指定 commit | `https://github.com/foo/sparrow-plugin-epay#9f2c1ab` |
| monorepo 子目录 | `https://github.com/foo/mono?subdir=plugins/epay&ref=v1.2.0` |

**拒绝**：`ssh://` / `git@`（需要凭据管理）、`http://`、`file://`、`ext::`（git 的 ext 协议等价于任意命令执行）、解析到内网/回环地址的主机。

私有仓库用面板级凭据（`settings.git_credentials`，按 host 配置 token），**不接受把 token 写在 URL 里**——URL 会进日志与审计表。

### 6.2 安装流水线（异步任务）

```
POST /api/v1/admin/plugins/preview { repoUrl }
 → 读取 manifest（raw.githubusercontent 或 depth=1 浅克隆后丢弃），返回 { key, name, version, hooks, permissions, egress, signature? }
 → 前端展示权限清单，管理员逐项确认（这一步不落库、不安装）

POST /api/v1/admin/plugins/install { repoUrl, ref?, subdir?, grantedScopes }
 → 建 task_run(plugin.install)，立即返回 taskId（前端轮询进度）
 → resolve     git ls-remote 解析 ref → commit sha（无 ref 取默认分支 HEAD）
 → fetch       git clone --depth 1 --no-recurse-submodules --config protocol.allow=only-https
 → verify      {subdir}/sparrow-plugin.json → zod 校验 → compatibility 版本区间
 → materialize 复制到 data/plugins/{key}/{version}/，计算目录 sha256 存档
 → start       生成 plugin token（上限 = grantedScopes）→ spawn → /healthz 探活
 → 成功 installed；失败清理目录，沿用上一个版本
```

要点：

- **ref 只在安装/升级时解析，装完即固定到 `commit_sha`**。作者往上推新代码不会悄悄影响正在跑的插件
- 安装是长任务，走 `task_runs` + 轮询，不占请求线程
- 同 key 已存在时视为升级，不是覆盖写
- clone 目标目录用临时路径 + 随机后缀，禁止把 `.git` 留在插件目录里

### 6.3 构建策略

| 场景 | 处理 |
|---|---|
| 仓库自带 `dist/` 或单文件入口 | 默认路径，面板只拷贝，不构建 |
| 只有源码（`build: 'npm'`） | 需要面板开启 `ALLOW_PLUGIN_BUILD=1`；只建议开发环境 |
| 缺入口文件 / 构建失败 | 安装失败，不落库 |

**面板上不跑 `npm install` / `postinstall`**：拉取任意依赖等于把供应链风险交给每个作者。要构建请作者在自己的 CI 产出 `dist/`，或用 `pnpm pack` 的产物。

### 6.4 版本、更新与回滚

- 插件身份 = `repo_url + commit_sha`；`version` 只用于展示与兼容判断，不参与去重
- `plugin:update-check` 每晚 `git ls-remote` 比对 sha，**只打 `update_available` 标记，不自动升级**
- 升级走同一条流水线装到新目录，探活通过才切 `active_version`，旧的保留
- 回滚 = 把 `active_version` 指回 `previous_version` + 重启进程，不重新下载

### 6.5 进程监管

```
supervisor（instrumentation.ts 启动）
 ├─ 启动：查 status = installed 且 enabled 的插件 → 逐个 spawn
 │        env: SPARROW_PANEL_URL / SPARROW_PLUGIN_KEY / SPARROW_PLUGIN_TOKEN / SPARROW_PLUGIN_PORT
 ├─ 探活：每 30s GET /healthz，连续 3 次失败 → 重启（退避 1s / 5s / 30s）
 ├─ 熔断：10 分钟内崩溃 5 次 → enabled = false + 告警，不无限重启
 └─ 限额：--max-old-space-size 上限；容器模式再叠 CPU/内存 cgroup
```

插件只监听 `127.0.0.1:{随机端口}`，不对外暴露；端口与 token 都存在内存里，重启重新分配。

### 6.6 社区插件的边界

| 项 | 约定 |
|---|---|
| 签名 | 有 ed25519 签名显示"已验证"；没有则标"未签名社区插件"，安装时强制二次确认 |
| 权限 | token scope = `grantedScopes`（⊆ manifest.permissions）；运行期只能降不能升 |
| 文件系统 | 插件目录只读；可写目录只有 `data/plugins/{key}/data` |
| 网络 | 只允许 `egress` 白名单内的域名（出口代理 + DNS 拦截）；内网地址段一律拒绝 |
| UI | `schema`（核心渲染表单）或 `iframe`（`sandbox="allow-scripts allow-forms"` + 短时 token + postMessage 桥，只开放 navigate/toast） |
| 资源 | 内存上限 + 单次调用 3s 超时；超限重启 |
| 隔离等级 | 默认 `process`（Node 子进程）；对完全不可信的插件建议 `container`（P2，只读挂载 + 无网络 + 低权限用户） |

"允许重启"是本设计的前提：插件进程随时可能被重启，因此**插件不得在内存里保存唯一状态**——需要持久化的东西写 `data/plugins/{key}/data` 或走面板 API。

## 7. 索引源与节点三方源

插件安装的主路径是 §6 的 git URL 直装；「索引源」只负责**浏览与发现**——列出有哪些仓库可装，点进去仍然走同一条安装流水线。

### 7.1 插件索引源

| 源类型 | 说明 | 同步方式 |
|---|---|---|
| `marketplace` | 官方维护的 JSON 索引（本质是一个 git URL 列表） | 定时拉取 |
| `url` | 任意 HTTP JSON 索引 | 定时拉取 + ETag |
| `git` | 仓库里的 `index.json` | 拉 raw，不 clone |
| `upload` | 离线环境上传 zip（校验后走 §6.2 的物化流程） | 即时 |

索引项只需要三个字段，不托管包体：

```jsonc
{ "key": "payment-epay", "repo": "https://github.com/foo/sparrow-plugin-epay", "tags": ["payment"] }
```

同步流程：拉索引 → 去重 → 对每条 `git ls-remote` 取最新 sha → 与已安装 sha 比对 → 打 `update_available` 标记。
**索引源不自动安装、不自动升级**，避免"上游某天一改，全站被动更新"。

### 7.2 节点三方源

从外部来源批量导入节点（如某机场的公开订阅、自己的监控 API）：

```
node.source.fetch hook → 插件返回节点列表
 → 面板校验（协议、参数完整性、域名/端口合法性）
 → 归一化 → 与现有节点去重（host+port+protocol 指纹）
 → 预览差异（新增/更新/失效）
 → 管理员确认后导入（可自动同步，按计划）
```

导入的节点标记 `source = 'plugin:<key>'`，可一键禁用/清理。

## 8. 支付插件（多渠道）

支付是**事件驱动**的插件，不占 schedules；但需要定时对账兜底（`payment.reconcile`，走 §5 的调度）。

### 8.1 分工

| 核心负责 | 插件负责 |
|---|---|
| 订单金额计算与校验 | 与网关通信、签名算法 |
| 订单状态机与幂等 | 生成支付页 / 二维码 |
| 开通订阅、发通知 | 解析回调、验签 |
| 渠道列表聚合 | 声明自身币种、限额、图标 |

**插件不能直接改订单状态**，只返回结论，由核心执行跃迁。

### 8.2 流程

```
GET  /api/v1/public/payment-gateways   ← 已启用的 payment 插件聚合（key / name / icon）
POST /api/v1/user/orders               → 订单 pending，锁定库存
POST /api/v1/user/orders/{no}/pay      → hook payment.gateway → { payUrl, qrcode }
POST /api/v1/pay/{gateway}/callback    → 插件验签 → { verified, tradeNo, amount, status }
   → 核心校验：金额一致、币种一致、订单仍 pending、trade_no 未被用过
   → paid → hook order.paid → 开通订阅 → 通知
```

### 8.3 必须守住的三条

1. **金额以库里为准**：回调金额与订单不一致 → 进 `pending_review`，不开通、不回滚库存
2. **幂等靠唯一约束**：`payment_records(gateway, trade_no)` 唯一；重复回调返回 200，但不重复开通
3. **状态机单向前进**：只允许 `pending → paid`；已 paid 的重复回调只补一条对账记录

### 8.4 多渠道并存

- 一个订单只走一个渠道，`orders.payment_method` 存插件 key
- 渠道可分别启停；停用不影响历史订单查询与对账
- 每个渠道独立配置（PID、密钥），`secret: true` 字段加密存储
- 新增渠道 = 新增插件，不改核心代码；P0 只内置易支付一个，Stripe / 支付宝当面付 / 微信 Native 全走插件

## 9. 插件管理界面

后台「插件管理」页：

- **列表**：名称、版本、来源仓库（`repo_url@sha 前 7 位`）、状态、权限、签名状态、最近错误
- **安装 / 升级**：填 git URL → 「预览」展示权限与出网域名 → 确认 → 后台安装进度（resolve / fetch / verify / start）→ 启用
- **详情**：manifest 解读、配置表单（由 `configSchema` 自动生成）、Hook 调用统计、事件日志、当前 `active_version` / `previous_version`
- **操作**：启用/禁用、升级（有 `update_available` 时）、回滚、重启、卸载（卸载前提示残留数据）
- **索引源**：源管理、手动同步（只发现，不自动装）
- **定时任务**：manifest 声明的 schedule、下次执行时间、最近运行结果、手动立即执行一次
- **健康**：进程状态、最近调用成功率、平均耗时、熔断状态

配置表单用 shadcn `Form` + react-hook-form 渲染，校验 schema 由 `configSchema` 转换而来，不引入额外表单框架。

## 10. 插件开发体验

提供 SDK 包 `@sparrow/plugin-sdk` 与脚手架 `create-sparrow-plugin`。

```ts
// src/index.ts
import { definePlugin } from '@sparrow/plugin-sdk'

export default definePlugin({
  key: 'payment-epay',
  hooks: {
    async 'payment.callback'({ payload }) {
      // 校验签名
      return { verified: true, tradeNo: payload.trade_no }
    }
  }
})
```

仓库结构约定（作者仓库叫什么名都行，关键是 manifest 的位置）：

```
sparrow-plugin-epay/
├── sparrow-plugin.json     # manifest，放仓库根或 ?subdir= 指定的目录
├── package.json
├── src/index.ts
└── dist/index.js           # 提交进仓库（build: none），或由作者 CI 产出
```

- `npx sparrow-plugin dev --panel http://localhost:3000 --token <dev-token>`：起本地进程、热重载、把 hook 调用打到终端
- `npx sparrow-plugin check`：校验 manifest schema、入口文件存在、权限名合法、`egress` 非内网——放作者 CI 里跑
- Hook 入参/出参类型由 `packages/contracts` 生成，SDK 直接引用
- 需要构建的插件请在作者侧 CI 完成并把 `dist/` 提交或放到 release，**不要指望面板装的时候帮你构建**

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 插件拖垮主流程 | 超时 + 熔断 + 关键 hook 失败进人工复核队列 |
| 第三方插件作恶 | 外置进程 + 权限最小化 + token 可吊销 + 审计日志 |
| 版本冲突 | manifest 声明兼容区间，面板安装前校验 |
| 插件拖慢响应 | hook 异步化（不阻塞主流程的部分用队列） |
| 插件定时任务重启后丢失 | manifest 声明 + 启动 reconcile + `next_run_at` 落库 |
| 插件长任务占满 ticker | 超时 + 同任务串行 + 长任务拆成"入队 + 分批" |
| 从 git URL 装到恶意代码 | 外置进程 + 权限确认 + 只读目录 + 出网白名单 + 未签名告警 |
| 上游仓库被删/改历史 | 安装即固定 `commit_sha`，回滚用本地 `previous_version`，不依赖上游可用性 |
| 插件作者用 `build: npm` 塞依赖 | 默认禁止面板构建；要 build 必须显式开 `ALLOW_PLUGIN_BUILD` |
| git URL 注入（`ext::` / 内网地址） | 只允许 https + 公网主机白名单，`protocol.allow=only-https` |
