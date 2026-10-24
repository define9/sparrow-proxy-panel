# 插件系统设计

## 1. 目标与边界

**目标**：让"支付网关、节点来源、订阅格式、通知渠道、后台页面"这类**会频繁变化**的能力，不需要改动面板核心代码就能接入；并支持从三方源安装第三方插件。

**非目标**：插件**不能**执行任意代码在面板主进程内、不能读写未经授权的数据、不能绕过 RBAC。

## 2. 两层运行时

| 层 | 运行位置 | 适用 | 特点 |
|---|---|---|---|
| **内置插件** | 面板进程内 | 官方能力（易支付、Stripe、Telegram） | 编译进产物，类型安全，零启动开销 |
| **外置插件** | 独立进程（HTTP/gRPC） | 第三方插件、需要第三方依赖的插件 | 崩溃不影响面板；可独立发版；需要显式授权 |

**默认策略**：第三方插件一律走外置进程。内置插件是"白名单例外"，随版本发布。

外置插件与面板的通信：

```
面板  ──HTTP POST──►  插件进程  /hook/{hookName}
插件  ──HTTP──►  面板 /api/v1/plugin/callback/{pluginKey}
```

面板调用插件时使用**每个插件独立的 token**，并在请求头带上上下文：

```
Authorization: Bearer <plugin_token>
X-Sparrow-Plugin: <plugin_key>
X-Sparrow-Signature: HMAC-SHA256(<plugin_token>, body)   # 防篡改/重放
```

## 3. 插件清单（manifest）

插件声明是一个 JSON（TypeScript 源码可选），schema 定义在 `packages/contracts/src/plugin/manifest.ts`：

```jsonc
{
  "key": "payment-epay",              // 唯一标识，小写 + 连字符
  "name": "易支付",
  "version": "1.2.0",
  "type": "payment",                  // payment | node_source | subscription | notify | hook | ui
  "description": "对接易支付聚合网关",
  "author": "sparrow",
  "runtime": "external",              // external | builtin
  "entry": "https://plugins.sparrow.dev/payment-epay/1.2.0/plugin.json",
  "checksum": "sha256:…",
  "signature": "ed25519:…",           // 发布者签名
  "permissions": [
    "order:read", "order:write",
    "settings:read", "settings:write"
  ],
  "hooks": ["order.created", "order.paid", "payment.callback"],
  "configSchema": {                    // JSON Schema，面板据此自动生成配置表单
    "type": "object",
    "properties": {
      "pid": { "type": "string", "title": "PID", "required": true },
      "key": { "type": "string", "title": "商户密钥", "secret": true }
    }
  },
  "ui": {                              // type=ui 时，后台页签定义
    "page": "/admin/plugin-settings",
    "nav": { "label": "插件设置", "icon": "i-lucide-plug" }
  },
  "compatibility": { "panel": ">=0.1.0 <1.0.0" }
}
```

要点：
- `configSchema` 用 JSON Schema → 面板用 `UForm` + Schema 库**自动生成配置表单**，插件不需要写前端
- `permissions` 是插件能调用面板 API 的上限，安装时展示给管理员确认
- `secret: true` 的字段在面板侧加密存储，API 返回时脱敏

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

## 5. 三方源支持

"三方源"指插件/节点信息的外部来源，分为两类：

### 5.1 插件三方源

| 源类型 | 说明 | 同步方式 |
|---|---|---|
| `marketplace` | 面板内置市场（后续 P2） | 定时拉取索引 |
| `url` | 任意 HTTP JSON 索引 | 定时拉取 + 校验 |
| `git` | Git 仓库中的 manifest 目录 | 定时 `git pull` 或拉 raw |
| `upload` | 管理员手动上传 zip | 即时 |

同步流程：

```
定时任务/手动触发
 → 拉取索引（带 ETag / If-Modified-Since）
 → 校验每项 checksum（sha256）
 → 校验发布者签名（ed25519，公钥内置或管理员配置）
 → 与本地已安装版本比对（语义化版本）
 → 有新版本 → 下载 → 校验 → 备份旧版 → 解包 → 校验 manifest → 切换 → 健康检查
 → 失败则回滚到旧版
```

安全要求：
- **必须**校验 sha256；启用签名校验时必须校验签名
- 解包做 zip slip 防护（路径穿越检查）、限制解压后大小、禁止可执行权限
- 插件进程以低权限用户运行，文件系统只读挂载（部署文档要求）
- 每个插件独立 token，可一键吊销

### 5.2 节点三方源

从外部来源批量导入节点（如某机场的公开订阅、自己的监控 API）：

```
node.source.fetch hook → 插件返回节点列表
 → 面板校验（协议、参数完整性、域名/端口合法性）
 → 归一化 → 与现有节点去重（host+port+protocol 指纹）
 → 预览差异（新增/更新/失效）
 → 管理员确认后导入（可自动同步，按计划）
```

导入的节点标记 `source = 'plugin:<key>'`，可一键禁用/清理。

## 6. 插件管理界面

后台「插件管理」页：

- **列表**：名称、版本、类型、来源、状态、权限、最近错误
- **详情**：manifest 解读、配置表单（由 `configSchema` 自动生成）、Hook 调用统计、事件日志
- **操作**：安装、启用/禁用、升级、配置、卸载（卸载前提示残留数据）
- **三方源**：源管理、手动同步、冲突处理
- **健康**：最近调用成功率、平均耗时、熔断状态

配置表单用 Nuxt UI 的 `UForm` + JSON Schema 校验实现，不引入额外表单框架。

## 7. 插件开发体验

提供 SDK 包 `@sparrow/plugin-sdk`：

```ts
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

- Hook 入参/出参类型由 `packages/contracts` 生成，SDK 直接引用，保证与面板一致
- 插件独立仓库可单独发版，通过 `sparrow-plugin.json` 声明
- 本地开发：`sparrow dev` 启动插件进程并注册到开发面板

## 8. 落地节奏

| 阶段 | 内容 |
|---|---|
| P1 | manifest + hook 机制 + 内置插件（易支付）+ 插件管理页 + 配置表单自动生成 |
| P1 | `url` 类型三方源 + checksum 校验 + 回滚 |
| P2 | 外置插件运行时 + 插件 SDK + `git` 源 + 签名校验 + 插件市场 |
| P2 | `node.source.fetch` 节点三方源 + 差异预览导入 |
| P3 | 插件 UI 扩展（schema 驱动的自定义面板）、插件间依赖 |

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 插件拖垮主流程 | 超时 + 熔断 + 关键 hook 失败进人工复核队列 |
| 第三方插件作恶 | 外置进程 + 权限最小化 + token 可吊销 + 审计日志 |
| 版本冲突 | manifest 声明兼容区间，面板安装前校验 |
| 插件拖慢响应 | hook 异步化（不阻塞主流程的部分用队列） |
