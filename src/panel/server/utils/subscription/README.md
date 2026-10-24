# 订阅模块（服务端）

用户端订阅管理 + 多格式订阅渲染。模块分三层：**纯函数渲染器** → **数据库读取 / DTO** → **HTTP 接口**。

```
server/utils/quota.ts              配额判定（唯一真理）
server/utils/subscription/
├── index.ts                       统一出口：renderSubscription(format, sub, nodes)
├── types.ts                       渲染器输入类型（契约字段子集）
├── limits.ts                      限速 / 流量倍率换算（纯函数）
├── yaml.ts                        极简 YAML 序列化（无第三方依赖）
├── v2ray.ts                       renderV2Ray()   → base64 链接列表
├── clash.ts                       renderClash()   → YAML（proxies + proxy-groups）
├── singbox.ts                     renderSingbox() → JSON（outbounds 数组）
├── loader.ts                      唯一访问数据库的地方（节点可见性 / DTO）
└── dto.ts                         详情 DTO、订阅链接、IP 白名单读写
```

## 渲染契约

三个渲染器都是**纯函数**：不访问数据库、不读配置、不产生副作用，同样的输入永远得到同样的输出。

| 函数 | 输出 | 说明 |
|---|---|---|
| `renderV2Ray(sub, nodes)` | base64 文本 | `vmess://`（base64 JSON）、`vless://`、`trojan://`、`ss://`，另兼容 `hysteria2://`、`tuic://` |
| `renderClash(sub, nodes)` | YAML | `proxies` + `proxy-groups`（select 组名固定 `Sparrow`） |
| `renderSingbox(sub, nodes)` | JSON | 顶层只有 `outbounds` 数组 |

节点参数取自 `nodes` 表（protocol / host / port / network / path / tls / sni / uuid / password / method 等）。

**换算规则**（`limits.ts`）：

- 限速：订阅的 `speedLimitMbps` → bps（`mbpsToBps`）；V2Ray 写进 vmess 的 `uplink`/`downlink`（Mbps），
  Clash / sing-box 写进 hysteria2、tuic 的 `up`/`down`（Mbps）。
- 流量倍率：节点的 `trafficRate` 归一化后作为节点名后缀（`香港 01 [2x]`），
  并把订阅剩余流量折算成节点侧可用配额（`quotaBytes = remainingBytes ÷ 倍率`）。
- 缺少凭据的节点（trojan/ss 无密码、vmess/vless 无 uuid）会被跳过，不下发不可用链接。

## 配额判定（唯一真理）

`server/utils/quota.ts` 导出 `evaluateQuota()` → `QuotaState`（`allowed / expired / overused / remainingBytes / usedRatio`）。
**其他任何地方都不允许复写这套判定**，接口、路由、渲染器一律调用它。

- `trafficLimit = 0` 表示不限流量（`remainingBytes` 返回 `UNLIMITED_BYTES` 哨兵值）。
- `status` 为 `paused` / `cancelled` 时 `allowed = false`。
- `nextResetAt()` / `canResetTraffic()` 负责「流量重置周期」。

## HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/user/subscriptions` | 列表（每项附 `quota`） |
| GET | `/api/v1/user/subscriptions/{id}` | 详情（`quota` + 各格式链接 + IP 白名单 + 节点数） |
| PATCH | `/api/v1/user/subscriptions/{id}` | 改格式 / 设备数 / 限速 / IP 白名单（本人）；配额 / 到期时间 / 节点组（仅管理员） |
| POST | `/api/v1/user/subscriptions/{id}/reset` | 重置流量（本人需已到重置周期，管理员随时可重置） |
| POST | `/api/v1/user/subscriptions/{id}/devices` | 踢下线（清面板侧设备记录） |
| GET | `/sub/{token}` | 订阅输出：`?format=v2ray\|clash\|singbox`，未指定时按 Accept 头推断 |
| GET | `/sub/{token}/info` | 订阅信息 JSON（契约 `SubscribeInfoSchema`） |

对象级权限：非本人的订阅一律按「不存在」处理（404 `SUB_NOT_FOUND`）。

订阅输出响应头：`Cache-Control: private, max-age=60`、`Subscription-Userinfo: upload=..; download=..; total=..; expire=..`。
过期 / 超量 / 暂停时返回 **403 + 可读纯文本**（并在 `X-Error-Code` 里带错误码）。

## 待协调者统一处理的事项

1. **i18n 注册**：`src/panel/i18n/locales/subscriptions.zh-CN.json`、`subscriptions.en.json`
   需要加进 `nuxt.config.ts` 的 `i18n.locales[].files`：

   ```ts
   { code: 'zh-CN', language: 'zh-CN', name: '简体中文', files: ['subscriptions.zh-CN.json', 'zh-CN.json'] },
   { code: 'en', language: 'en', name: 'English', files: ['subscriptions.en.json', 'en.json'] }
   ```

   注册前页面由 `app/composables/useSubscriptionI18n.ts` 运行时兜底（同一份文案，内容一致）。

2. **菜单合并**：`app/utils/nav/subscriptions.ts` 导出 `subscriptionsNav`，请在
   `app/utils/navigation.ts` 的 `userNav` 里合并（`navigation.ts` 不在本任务可改范围内）。
   目前 `navigation.ts` 里已有等价的 `nav.subscriptions` 条目。

3. **IP 白名单存储**：数据库没有对应字段，本次暂存在 `settings` 表的
   `subscription:{id}:ipWhitelist` 键里（jsonb 数组）。若要正式支持，建议后续加列或加表。

4. **设备记录**：数据库没有设备表，设备与并发连接由 Agent / 内核维护。
   `POST /subscriptions/{id}/devices` 目前只清面板侧的设备快照，
   内核侧强制断连需要 Agent 收到配置重载（`agent_commands`）后完成。

5. **订阅限流**：`api-design` 要求的「同一 token 1 分钟最多 10 次」尚未实现
   （`server/middleware/rate-limit.ts` 不存在），建议由统一限流中间件补齐。

6. **流量重置的计费**：契约里没有重置价格模型，本次实现为「一个计费周期内仅可手动重置一次」，
   若要收费需在订单 / 余额侧补规则。
