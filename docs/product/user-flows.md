# 关键用户流程

## 1. 注册 → 首次下单 → 使用

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 访问首页  │──▶│ 注册     │──▶│ 选商品   │──▶│ 下单支付  │──▶│ 获取订阅  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                   │                                │                │
                   │ 邮箱验证码                       │ 支付网关插件      │ 复制订阅链接
                   ▼                                ▼                ▼
              账号创建                        订单 paid         客户端导入
                                                                    │
                                                         ┌──────────┴──────────┐
                                                         ▼                     ▼
                                                   连接节点              查看流量/到期
```

## 2. 认证流程

### 2.1 注册

| 步骤 | 接口 | 校验 | 失败处理 |
|---|---|---|---|
| 1. 输入邮箱、密码、验证码 | — | 前端 zod；密码强度 | 表单内联提示 |
| 2. 发送验证码 | `POST /api/v1/auth/email-code` | 频率 1/60s，同 IP 10/小时 | 429 |
| 3. 提交注册 | `POST /api/v1/auth/register` | 邮箱唯一、验证码正确、密码强度 | 422 + 字段错误 |
| 4. 触发 hook | `user.registered` | — | 插件失败仅记录 |
| 5. 自动登录并跳转 | — | — | — |

要点：
- 邮箱验证码存进程内存（key = `email:code:{email}`，TTL 10 分钟，带发送次数限制；单机重启即失效，安全上更安全）
- 若站点开启邀请码，验证码之后校验邀请码
- 注册成功默认赠体验额度（可配，`settings.register_gift_traffic`）

### 2.2 登录

```
POST /api/v1/auth/login { email, password }
 → 校验账号状态（disabled → 403 USER_DISABLED）
 → 校验密码（失败计数：5 次锁定 15 分钟）
 → 若开启 2FA → 返回 { need2FA: true, challengeId }（不返回会话）
 → 客户端提交 TOTP → POST /api/v1/auth/2fa/verify → 建立会话
 → 触发 hook user.login，写 login_logs
```

### 2.3 会话与登出

- 会话建立后写 `sessions` 表（可强制下线）
- 空闲 2 小时 / 绝对 7 天过期
- 登出删除服务端会话记录 + 清除 cookie

## 3. 下单与支付

```
选择商品 → 确认配置（可选：数量/时长）→ 创建订单（pending，锁定库存）
   → 选择支付方式（插件网关列表）
   → 调用 hook payment.gateway → 返回支付页/二维码
   → 用户支付
   → 网关回调 POST /api/v1/pay/{gateway}/callback
       → 插件验签 → 金额校验 → 幂等检查 → 订单 paid
       → 触发 hook order.paid
       → 创建订阅（subscription.created）
       → 发送通知
   → 订单未支付超过 expires_at → 定时任务置 expired，释放库存
```

### 状态机

```
订单:  pending ──支付成功──▶ paid ──退款──▶ refunded
           │                  │
           ├──取消──▶ cancelled│
           └──超时──▶ expired ─┘（不可再支付）

订阅:  active ──到期──▶ expired
           ├──暂停──▶ paused ──恢复──▶ active
           └──取消──▶ cancelled
```

规则：
- 订单一旦 `paid` 不允许回退到 `pending`
- 订阅 `active` 状态下配额判定失败 → 订阅转 `expired` 或标记超量（`traffic_used > traffic_limit`），**不删除订阅记录**
- 库存扣减在创建订单时预占（`stock` 减 1），取消/过期时释放

## 4. 订阅与使用

### 4.1 订阅生成

```
用户请求 /sub/{token}
 → 校验 token 存在（内存缓存）
 → 检查订阅状态（expired / 超量 → 返回提示文本）
 → 取该订阅可见的节点组 → 取组内在线节点
 → 渲染为目标格式（v2ray / clash / singbox）
 → 返回（Cache-Control: private, max-age=60）
```

渲染器是纯函数：`render(subscription, nodes, format) → string`，放在 `lib/subscription/`，插件可通过 `subscription.render` hook 覆盖。

### 4.2 节点可见性

```
商品 → plan_node_groups → 节点组 → nodes
管理员可为单个订阅单独追加/移除节点组（subscription_node_groups 覆盖商品默认）
```

### 4.3 流量与配额

```
Agent 每 30s 上报 per-user 流量 → 进程内计数器累加
 → traffic:flush（30s）批量 UPSERT traffic_daily，更新 subscriptions.traffic_used
 → 用户端/管理端读取 traffic_used 与 traffic_limit 计算进度
 → 超过 traffic_limit：标记超量，节点侧拒绝新连接（通过下发规则）
```

超限后的行为：面板在下次下发配置时把该用户 `limit` 置 0（内核侧停止计量），订阅状态转 `expired` 并发通知。

### 4.4 设备数限制

设备数限制由**节点侧**执行（内核的 `policy` / sing-box 的 `user` 数量限制）实现：

- 面板下发规则时带上 `deviceLimit`
- Agent 侧内核维护并发连接数，超出即拒绝新连接
- 用户端「踢下线」= 面板下发命令 → Agent 重置该用户的连接 → 内核释放名额

> 若内核层面难以精确实现"同时在线设备数"，退化为"最大并发连接数"，并在 UI 上明确说明口径。

## 5. 节点接入流程

```
管理员在后台创建节点
 → 填写协议参数（域名、端口、证书、REALITY 等）
 → 面板生成节点配置（config_version + 1）
 → 生成一次性注册 token
 → 管理员在节点执行：sparrow-agent register --url ... --token ...
 → Agent 注册成功，拿到 node_id + node_secret，写入本地配置
 → Agent 心跳上线，面板节点状态变「在线」
 → Agent 拉取配置 → 应用内核 → 开始承载流量
```

节点参数变更（域名/端口/证书）→ 面板 `config_version` 递增 → Agent 下次轮询（≤5 分钟）拉取新配置并热重载，无需重启 Agent。

## 6. 管理员操作流程

### 6.1 手工开通订阅

```
用户管理 → 选中用户 → 「手工开通」→ 选商品 + 时长 → 确认
 → 创建订单（paid，金额 0，meta.manual = true）+ 创建订阅
 → 写审计日志（谁、何时、给谁、什么）
```

### 6.2 批量调整订阅

```
订阅管理 → 多选 → 批量操作（延长天数 / 调整配额 / 改限速 / 改节点组）
 → 后端事务内批量更新 + 审计日志逐条记录
 → 触发缓存失效（相关订阅的渲染缓存）
```

### 6.3 插件安装（git URL）

```
插件管理 → 「安装插件」→ 粘贴 git URL（可带 #ref / ?subdir=）
 → 「预览」：解析 manifest，展示申请的权限、出网域名、是否签名、版本兼容性
 → 管理员逐条确认权限 → 确认安装
 → 后台任务：resolve sha → clone → 校验 manifest → 物化到 data/plugins/{key}/{version}
 → 生成 token（scope = 已批准的权限）→ 启动进程 → /healthz 通过
 → 状态「已安装」→ 填配置（configSchema 生成的表单）→ 启用
失败 → 清理临时目录，保留上一个版本，task_run 记录错误
```

## 7. 通知触点

| 事件 | 通知内容 | 渠道（插件） |
|---|---|---|
| 注册成功 | 欢迎 + 体验额度 | 邮件 / Telegram |
| 订单创建 | 待支付提醒（含倒计时） | 邮件 |
| 支付成功 | 订单确认 + 订阅链接 | 邮件 / Telegram |
| 流量达 80% | 流量预警 | Telegram / 邮件 |
| 流量用尽 | 配额耗尽提示 | 邮件 / Telegram |
| 到期前 3 天 | 到期提醒 | 邮件 / Telegram |
| 已到期 | 订阅失效 | 邮件 |
| 节点离线 | 运维告警（管理员） | Telegram（仅管理员） |

所有通知走 `notification.send` hook，渠道由插件提供；无插件时静默跳过，不影响主流程。
