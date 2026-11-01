# 邮件发送（notify provider）

> 一句话：**业务只调用 `sendMail()`，具体走哪家服务由 `settings.mail.provider` 决定；新增服务商 = 新增一个 `MailProvider` 实现并注册，不改业务代码。**

## 1. 分层位置

```
app/api/**/route.ts            HTTP 适配（校验 + 调 service）
  └─ lib/services/mail.ts      模板组装 / 测试发送（业务）
  └─ lib/services/auth.ts      验证码 / 找回密码编排（业务）
       └─ lib/notify/index.ts  resolveMailProvider() / sendMail()（发送入口）
            ├─ lib/notify/registry.ts   内置注册表（可注册外部实现）
            ├─ lib/notify/resend.ts     notify-resend：Resend HTTP API
            └─ lib/notify/log.ts        notify-log：本地日志（开发用）
```

`lib/notify` 不直接访问数据库：配置统一由 `lib/services/settings.ts#getMailConfig()` 读出并归一化。

## 2. 配置结构（settings 表 key = `mail`）

```jsonc
{
  "provider": "resend",            // resend | log
  "resend": { "apiKey": "re_xxx", "from": "Sparrow <noreply@yourdomain.com>" },
  "smtp":   { "host": "", "port": 465, "username": "", "password": "", "from": "" },
  "testTo": "you@example.com"
}
```

- 旧扁平结构 `{ host, port, username, password }` 读取时自动映射到 `smtp`，不需要迁移
- `apiKey` 与 `smtp.password` 返回给前端时脱敏为 `••••`，并附 `hasApiKey` / `hasPassword`
- 提交时密钥为 `••••` 或空表示保留原值；设置页仍在下发旧字段，服务端同样兼容
- `smtp.*` 目前只保留配置，**不实现 SMTP 投递**（未支持的能力不静默假装成功）

## 3. Provider 契约（`lib/notify/types.ts`）

```ts
export interface MailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export interface MailProvider {
  key: string   // 'notify-resend' | 'notify-log'
  name: string  // 展示名
  send(msg: MailMessage): Promise<{ id?: string }>
}
```

- `notify-resend`：`POST https://api.resend.com/emails`，`Authorization: Bearer <apiKey>`，body `{ from, to, subject, html, text }`；非 2xx 抛出带响应体的错误
- `notify-log`：写 `[notify:log]` 前缀的结构化日志，返回 `{ id: 'log' }`；生产环境使用会额外告警
- `resolveMailProvider()`：配置不完整（Resend 缺 apiKey）时返回 `null`
- `sendMail(msg)`：未配置 → `422 MAIL_NOT_CONFIGURED`；上游失败 → `502 MAIL_SEND_FAILED`，`data.detail` 带原始响应体

## 4. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/settings` | `mail` 按 §2 结构返回（密钥脱敏） |
| PUT | `/api/v1/admin/settings` | 接受 `mail`；占位符 / 空值不覆盖真实密钥 |
| POST | `/api/v1/admin/settings/mail/test` | body `{ to }`，用当前配置发测试信 → `{ ok: true, provider }`；未配置 → 422 |
| POST | `/api/v1/auth/email-code` | resend 已配置 → 真发信且不返回 `devCode`；log / 未配置 → 返回 `devCode` |
| POST | `/api/v1/auth/password/forgot` | body `{ email }`；账号存在才投递，响应与账号不存在时一致（防枚举） |
| POST | `/api/v1/auth/password/reset` | body `{ email, code, password }`；校验重置码 → 改密 → 吊销该用户全部会话 |

验证码存进程内存（单机部署），登录码与重置码分命名空间，10 分钟有效、最多 5 次尝试。

## 5. 新增一个 provider

1. 在 `lib/notify/` 下实现 `MailProvider`（内部可用 `fetch`，不引入 SDK）
2. 在 `lib/notify/registry.ts` 注册：

```ts
registerMailProvider({
  key: 'notify-xxx',
  name: 'XXX 邮件',
  create: (config) => (config.xxx.apiKey ? createXxxProvider(config.xxx) : null)
})
```

3. 在 `settings.mail.provider` 增加取值、在 `providerKeyFor()` 补映射

外部进程插件接入时，对应 hook 是 `notification.send`（见 [plugin-system.md](plugin-system.md) §4）：hook 入参 `{ channel, template, payload }`，插件返回 void；面板侧仍以 `MailProvider` 作为内置实现的统一出口。
