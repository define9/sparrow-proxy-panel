# 数据模型

PostgreSQL 17 + Drizzle。所有表使用 `uuid` 主键（`gen_random_uuid()`，pgcrypto 内置），时间戳用 `timestamptz` 存 UTC，展示层按 locale 格式化。

## 0. 通用约定

| 约定 | 规则 |
|---|---|
| 命名 | 表名复数小写下划线；外键列 `<单数>_id` |
| 金额 | `numeric(12,2)`（不用 float）；币种 `char(3)` |
| 流量/字节 | `bigint`，单位：字节 |
| 时间 | `timestamptz`，应用层一律传 UTC |
| 软删除 | 仅用户/节点/商品等需要恢复的表用 `deleted_at`，其余物理删除 |
| 扩展字段 | `extra jsonb`（仅插件、节点等开放表）；核心业务字段禁止塞 jsonb |
| 枚举 | 用 PG 原生 `enum` 类型，迁移时新增值不用改表结构 |

---

## 1. 身份与权限

### users

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| email | citext unique | 登录名，citext 大小写不敏感 |
| username | varchar(64) unique | 展示名 |
| password_hash | text | Argon2id |
| role_id | uuid → roles | |
| status | enum(active, disabled, pending) | pending = 未验证邮箱 |
| balance | numeric(20,8) | 账户余额（按量计费 / 插件消费） |
| currency | char(3) | 默认 CNY |
| traffic_limit | bigint | 账户级总配额（0 = 不限） |
| traffic_used | bigint | 冗余累计，列表页直接读 |
| last_login_at | timestamptz | |
| register_ip | inet | |
| telegram_id | text unique | |
| email_verified_at | timestamptz | |
| twofa_enabled | bool | |
| twofa_secret | text | AES-GCM 加密存储 |
| remark | text | 管理员备注 |
| created_at / updated_at | timestamptz | |

索引：`email` unique、`username` unique、`status`（部分索引 `WHERE status='active'`）、`created_at`、`telegram_id` unique

### roles / permissions / role_permissions

| 表 | 列 |
|---|---|
| roles | id pk, code unique, name, is_system bool, description, created_at |
| permissions | id pk, code unique（如 `admin:node:write`）, name, group_name |
| role_permissions | role_id + permission_id（复合主键） |

内置角色：`user` / `admin` / `superadmin`。权限点定义在 `packages/contracts/src/permissions.ts`，后端校验与前端菜单共用同一份。

### personal_access_tokens

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid → users | |
| name | varchar(64) | |
| token_prefix | varchar(12) | 展示用，如 `spx_abc123` |
| token_hash | text | 只存 hash，明文仅创建时返回一次 |
| scopes | text[] | 如 `['subscription:read']` |
| last_used_at | timestamptz | |
| expires_at | timestamptz null | |
| revoked_at | timestamptz null | |

### sessions

管理端需要"强制下线"能力，所以会话统一存库；cookie 里只放会话标识。

| 列 | 类型 |
|---|---|
| id | uuid pk |
| user_id | uuid → users |
| session_token | text unique |
| ip / user_agent | inet / text |
| created_at / expires_at / last_seen_at | timestamptz |

---

## 2. 商品与订单

### plans（商品）

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| name | varchar(128) | |
| slug | varchar(64) unique | |
| description | text | 支持 markdown |
| type | enum(traffic, time, bandwidth) | 流量包 / 时长包 / 带宽套餐 |
| price | numeric(12,2) | |
| original_price | numeric(12,2) null | 划线价 |
| currency | char(3) | |
| traffic_gb | bigint | 总流量（GB），0 = 不限 |
| duration_days | int | 有效期天数 |
| device_limit | int | 同时在线设备数 |
| speed_limit_mbps | int | 0 = 不限速 |
| reset_day | int | 每月流量重置日（1-28） |
| renew_reset_ratio | numeric(4,2) | 续费时重置流量比例（1 = 全额重置） |
| stock | int null | null = 不限库存 |
| sold_count | int | |
| status | enum(draft, active, inactive) | |
| sort | int | 排序 |
| is_hot | bool | 首页推荐 |
| tags | text[] | |

关联：`plan_node_groups(plan_id, node_group_id)` —— 购买后可用的节点组。

### orders

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| order_no | varchar(32) unique | 对外单号 |
| user_id | uuid → users | |
| plan_id | uuid → plans | |
| amount | numeric(12,2) | 实付 |
| discount | numeric(12,2) | 优惠额 |
| coupon_id | uuid null | |
| status | enum(pending, paid, cancelled, expired, refunded) | |
| payment_method | varchar(32) null | 插件 key |
| trade_no | varchar(64) null | 第三方交易号 |
| expires_at | timestamptz | 未支付自动关闭 |
| paid_at | timestamptz | |
| meta | jsonb | 快照（商品名、单价、下单时配置） |
| created_at / updated_at | timestamptz | |

索引：`order_no` unique、`(user_id, created_at desc)`、`(status, created_at desc)`、`trade_no`

### coupons

id pk, code unique, type enum(fixed, percent), value numeric, quota int, used_count int, plan_ids uuid[], min_amount numeric, expires_at, enabled bool

### payment_records

id pk, order_id, gateway varchar(32), amount numeric, status enum(pending, success, failed), trade_no varchar(64), raw jsonb（回调原文，用于对账）, created_at

---

## 3. 订阅与配额

### subscriptions

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid → users | |
| plan_id | uuid → plans | |
| order_id | uuid → orders | |
| token | uuid unique | 订阅凭据（URL 里用它） |
| format | enum(v2ray, clash, singbox) | 默认渲染格式 |
| status | enum(active, paused, expired, cancelled) | |
| device_limit | int | |
| speed_limit_mbps | int | |
| traffic_limit | bigint | 配额（字节），0 = 不限 |
| traffic_used | bigint | 已用（字节），由聚合任务写入 |
| upload / download | bigint | 分向累计 |
| expire_at | timestamptz | |
| reset_at | timestamptz | 下次流量重置时间 |
| created_at / updated_at | timestamptz | |

约束：部分唯一索引 `UNIQUE(user_id, plan_id) WHERE status IN ('active','paused')` —— 同一商品不允许并存两个有效订阅。
索引：`token` unique、`(user_id, status)`、`expire_at`（过期扫描）、`traffic_used`

关联：`subscription_node_groups(subscription_id, node_group_id)` —— 用户实际能连的节点组（来自商品，可被管理员单独调整）。

### 配额判定（唯一真理）

判定逻辑集中在 `lib/quota.ts`：

```
expired   = expire_at <= now()
overused  = traffic_limit > 0 AND traffic_used >= traffic_limit
denied    = expired OR overused OR status != 'active'
```

任何接口要判断"用户能否使用"都必须调用它，禁止各处复写。

---

## 4. 节点

### node_groups

id pk, name varchar(64), sort int, region varchar(64), remark text

### nodes

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| name | varchar(128) | |
| group_id | uuid → node_groups | |
| protocol | enum(vless, vmess, trojan, shadowsocks, hysteria2, tuic) | |
| host | varchar(255) | 对外域名/IP |
| port | int | 对外端口 |
| server_port | int | 实际监听端口（与对外不同则填） |
| network | enum(tcp, ws, grpc, http, kcp, quic) | |
| path / host_header | varchar | 传输参数 |
| method / flow / password / uuid | varchar | 协议参数 |
| security | varchar | vmess security / ss method |
| tls_mode | enum(none, tls, reality) | |
| sni / server_name | varchar | |
| alpn | text[] | |
| allow_insecure | bool | |
| reality_public_key / reality_short_id / reality_spider_x | varchar | REALITY 参数 |
| fingerprint | varchar | utls fingerprint |
| public_key / private_key | text | 私钥加密存储 |
| certificate_id | uuid → node_certificates | |
| extra | jsonb | 协议特有参数 |
| traffic_rate | numeric(5,2) | 计费倍率，默认 1.0 |
| priority / weight | int | 负载均衡优先级与权重 |
| status | enum(online, offline, maintenance) | 管理侧状态 |
| is_relay | bool | 中转节点 |
| sort / remark | int / text | |
| last_seen_at | timestamptz | 最近心跳 |

索引：`group_id`、`status`、`(status, sort)`、`host`

### node_certificates

id pk, name, type enum(generic, custom), cert text, key text (加密), issuer, not_before, not_after, source enum(acme, manual), acme_config jsonb

### node_heartbeats（每节点一行，高频覆盖）

node_id pk, status enum(online, offline, degraded), cpu numeric(5,2), memory numeric(5,2), disk numeric(5,2), net_rx bigint, net_tx bigint, online_users int, agent_version, core_version, reported_at timestamptz

> 该表只保留最新值（UPSERT），历史指标按需保留到 `traffic_logs`，或对接 Prometheus。

### node_configs（下发配置缓存）

node_id pk, version bigint, config jsonb, rendered_at timestamptz

### agent_commands（下行命令队列）

id pk, node_id, command enum(reload_config, restart_core, upgrade_core, update_agent, set_log_level, sync_now), payload jsonb, status enum(pending, acked, done, failed), issued_at, acked_at, finished_at, result jsonb

### agent_events（节点上报事件）

id pk, node_id, type varchar(64), level enum(info, warn, error), message text, payload jsonb, created_at

---

## 5. 流量

### traffic_logs（明细，按天分区）

id bigserial, user_id, node_id, subscription_id, upload bigint, download bigint, total bigint, created_at timestamptz
分区：`PARTITION BY RANGE (created_at)`，每日一个分区，保留 30 天，超期分区 DROP（比 DELETE 快几个数量级）。

### traffic_daily（汇总）

user_id, date, upload, download, total, node_count int —— 复合主键 `(user_id, date)`
节点维度汇总单独 `traffic_daily_node(node_id, date, user_id, upload, download)`。

写入路径：Agent 上报 → 进程内按 uid 累加 → `traffic:flush`（30 秒）批量 UPSERT 到 daily 与 `subscriptions.traffic_used` → 每日把明细归档到 `traffic_logs` 分区（可选，明细可只保留 7 天）。

---

## 6. 插件

### plugins

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| key | varchar(64) unique | 插件标识，来自 manifest |
| name | varchar(128) | |
| version | varchar(32) | 当前生效版本（展示用，不参与去重） |
| type | enum(payment, node_source, subscription, notify, hook, ui) | |
| source_type | enum(builtin, git, upload) | 社区插件固定为 `git` |
| repo_url | text | 安装用的 git URL（已规范化，不含 ref） |
| git_ref | varchar(128) | 安装时指定的 ref（tag/branch/sha），仅留档 |
| commit_sha | char(40) | **实际安装的提交**，与 repo_url 共同构成插件身份 |
| runtime | enum(process, container) | 默认 `process` |
| entry | varchar(255) | 入口文件相对路径 |
| build | enum(none, npm) | `npm` 需要在面板开启 `ALLOW_PLUGIN_BUILD` |
| ui_mode | enum(schema, iframe, none) | 不允许注入主应用 bundle |
| checksum | varchar(64) | 物化后目录树的 sha256 |
| manifest | jsonb | 声明的 hooks / schedules / permissions / configSchema |
| config | jsonb | 用户填写的配置（密钥字段加密） |
| permissions | text[] | manifest 申请的上限 |
| granted_scopes | text[] | 管理员批准的实际授权（⊆ permissions） |
| egress | text[] | 允许访问的出网域名 |
| active_version | varchar(32) | 当前生效版本目录 |
| previous_version | varchar(32) null | 回滚目标 |
| health | enum(healthy, unhealthy, unknown) | 最近一次探活结果 |
| last_health_at | timestamptz | |
| status | enum(installed, disabled, error, installing) | |
| installed_at / updated_at | timestamptz | |

唯一约束：`(repo_url, commit_sha)`；索引：`key` unique、`status`、`(repo_url)`。
插件文件落在 `data/plugins/{key}/{version}/`，只读；可写目录 `data/plugins/{key}/data/`。

### plugin_events

id pk, plugin_id, hook varchar(64), status enum(success, error, timeout), duration_ms int, error text, payload jsonb, created_at

### plugin_jobs（插件定时任务的物化表）

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| plugin_key | varchar(64) | `core.*` 表示核心内置任务 |
| job_key | varchar(64) | 来自 manifest `schedules[].key` |
| cron | varchar(64) | 5 段 cron，`tz` 可选 |
| handler | varchar(128) | 执行器里的 handler 名 |
| payload | jsonb | 静态入参 |
| enabled | bool | 插件禁用/卸载时置 false |
| next_run_at | timestamptz | 由 `nextCron(cron, now)` 计算，**重启后靠它续跑** |
| last_run_at / last_status | timestamptz / enum(ok, failed, skipped, timeout) | |

唯一键 `(plugin_key, job_key)`；索引 `(enabled, next_run_at)` 供 ticker 扫描。

### plugin_job_runs（执行记录）

id pk, job_id, run_id uuid unique（传给插件的幂等键）, started_at, finished_at, status enum(ok, failed, timeout, skipped), duration_ms, error text, result jsonb

> 与 `task_runs` 的区别：`task_runs` 记录一次性耗时任务，`plugin_job_runs` 记录周期任务的每次触发，按 30 天裁剪。

### plugin_sources（三方源）

id pk, name, type enum(url, git, marketplace), url text, enabled bool, last_sync_at, last_status, last_error, checksum, created_at

---

## 7. 系统

| 表 | 列 |
|---|---|
| settings | key pk, value jsonb, updated_at |
| announcements | id pk, title, content, scope enum(global, user, admin), status enum(draft, published, archived), published_at, created_at |
| audit_logs | id bigserial, actor_type enum(user, agent, plugin, system), actor_id, action varchar(64), target_type, target_id, ip inet, user_agent text, meta jsonb, created_at（按月分区） |
| login_logs | id bigserial, user_id, ip inet, user_agent text, success bool, reason varchar(64), created_at |
| task_runs | id pk, name varchar(64), status enum(running, success, failed), started_at, finished_at, error text, meta jsonb |
| webhooks | id pk, url, secret, events text[], enabled bool, created_at |


### settings 的 key 约定

`settings` 是唯一的「系统级键值」表，值为 JSON 字符串。当前使用的 key：

| key | 内容 | 谁读写 |
|---|---|---|
| `site` | 站点名、Logo、公告、备案号 | 管理端「站点」Tab、公开接口 `/public/site` |
| `register` | 开放注册、邮箱验证、赠送流量、邀请码 | 管理端「注册」Tab |
| `mail` | `provider` + `resend`/`smtp` 配置 + `testTo`（密钥脱敏、`••••` 回写不覆盖） | [notify-providers](notify-providers.md) |
| `payment` | 仅保留 `{ default: "payment-epay" }`；各渠道配置已迁到 `plugins.config` | 管理端「支付」Tab |
| `setup` | 初始化标记（存在即视为已初始化，幂等防重复建超管） | `/api/v1/setup` |

> 支付渠道的密钥字段由 `lib/plugin-host/secret.ts` 用 `MASTER_KEY` 派生密钥做 AES-256-GCM，
> 落库形如 `v1$<sha256>$<iv>$<tag>$<ciphertext>`；接口回显一律 `••••`。

## 8. ER 概览

```
users ─┬─ orders ─── plans ─── plan_node_groups ─── node_groups ─── nodes
       │                            │                                    │
       ├─ subscriptions ────────────┘                                    ├─ node_heartbeats
       │      └─ subscription_node_groups                                 ├─ node_configs
       │                                                                    ├─ agent_commands
       ├─ personal_access_tokens                                          └─ agent_events
       ├─ sessions
       └─ traffic_daily ─── traffic_logs(分区)

plugins ─┬─ plugin_events
         ├─ plugin_jobs ─── plugin_job_runs
         └─ plugin_sources
settings / announcements / audit_logs / login_logs / task_runs / webhooks
```

## 9. 迁移策略

- 工具：Drizzle Kit（`drizzle-kit generate` 生成 SQL，人工 review 后 `migrate`）
- 迁移文件进版本库，**只增不改**（已发布的迁移文件禁止修改）
- 破坏性变更分两步：先加新列 → 双写 → 迁移数据 → 删旧列（跨至少两个版本）
- 生产执行：`pnpm db:migrate`（容器启动前置钩子，或独立 Job）
- 大表变更（加索引）用 `CREATE INDEX CONCURRENTLY`，避免锁表
- **扩展依赖**：`users.email` 使用 `citext`（大小写不敏感），首个迁移必须先执行
  `CREATE EXTENSION IF NOT EXISTS citext;`，否则迁移会失败（已在 `0000_*.sql` 中前置）
- CI 校验：`pnpm db:check`（重新 generate 后 git diff 必须为空）

### 环境变量

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | 运行时与 drizzle-kit 共用（迁移 / seed / 应用） |
| `MASTER_KEY` | 节点私钥 / 插件密钥 / 2FA 密钥的加密主密钥 |
| `NEXT_PUBLIC_SITE_URL` | 站点对外地址（生成订阅链接、支付回调地址） |
