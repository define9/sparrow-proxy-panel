# 路线图

粒度为"可交付、可验收"：每个阶段结束时代码可运行、可部署、可演示。
勾选状态是本项目唯一的进度记录。`[~]` 表示已实现但只覆盖部分场景。

## P0 · MVP（目标：单站点可运营）

### 工程基线

- [x] monorepo 骨架：pnpm workspaces + 共享 tsconfig + mise 工具链
- [x] `packages/contracts`：zod 类型 + 权限点（24 个）
- [x] Next.js 应用骨架：App Router、Tailwind 4 + shadcn、主题与明暗模式
- [x] 数据模型：31 张表、迁移已应用、seed 脚本
- [ ] CI：lint / typecheck / build / `check:layers` / 迁移漂移检测
- [ ] Renovate 与版本锁定

### 后端

- [x] 认证：登录 / 登出 / 会话（`sessions` 表）/ RBAC 权限点 / 登录日志
- [x] 注册：邮箱验证码（内存态 + devCode）、自动登录
- [x] 商品：列表/详情（用户端 + 公开接口 + 管理端 CRUD/复制/上下架）
- [x] 订单：创建（库存扣减）、列表、详情、取消、状态机、管理端手动完成/退款
- [~] 支付：内置演示网关（下单→支付→开通订阅，幂等）；第三方网关走插件，未实现
- [x] 订阅：列表/详情、格式切换、渲染（v2ray / clash / sing-box）、`/sub/{token}` 输出与 `/info`
- [x] 节点：CRUD、节点组、证书、配置渲染骨架、同步命令
- [x] Agent 协议：注册 / 心跳 / 配置（304）/ 流量上报（seq 幂等），HMAC 签名 + 4 组固定向量
- [x] 流量：`traffic_logs` 写入、`traffic:flush` 聚合到 `traffic_daily`、用户/管理端趋势接口
- [x] 定时任务：`instrumentation.ts` + advisory lock（traffic:flush / subscription:expire / node:health）
- [x] 日志：登录日志、审计日志（写操作留痕）、任务日志
- [ ] 订阅配额判定集中到 `lib/quota.ts`（当前散在服务层）
- [ ] 2FA（TOTP）与找回密码邮件

### 前端

- [x] shadcn 基座：`components/ui`、主题切换、Toaster、Sidebar、Command 面板
- [~] i18n：next-intl 已接入，导航与通用词已翻译；页面文案仍为中文硬编码
- [x] 布局：公开页 / 认证页 / 用户端 / 管理端
- [x] 导航：权限过滤菜单、⌘K 命令面板、面包屑
- [x] 认证页：登录/注册已接真实接口；找回密码为提示（邮件插件未实现）
- [x] 用户端：概览、商品、下单、订单、订阅、流量、设置（设置写操作仍为提示）
- [x] 管理端：仪表盘、商品、订单、订阅、节点、证书、用户、插件、索引源、日志、优惠券、设置（全部接真实接口）
- [x] 通用组件：DataTable、StateBadge、StatCard、QuotaBar、CopyButton、EmptyState

### Agent

- [ ] 配置解析、注册、签名、心跳（Go 侧未开始，协议已在面板侧就绪）
- [ ] 拉取配置并应用（sing-box）、内核进程守护
- [ ] 流量采集与上报
- [ ] systemd 单元、安装脚本

### 验收标准

- 完整跑通：注册 → 下单 → 支付 → 拿到订阅链接 → 客户端能连上节点 → 流量出现在面板
  （前四步已打通，节点侧需 Go Agent）
- 面板不可达时，节点继续服务（缓存配置）
- `pnpm lint` / `typecheck` / `build` 全绿
- OpenAPI 契约漂移检测在 CI 生效（待 CI）
- Agent 签名与面板 canonical 一致（4 组向量已落在 `docs/architecture/agent-sign-vectors.md`）

## P1 · 可运营（目标：能真实对外接单）

- [ ] 优惠券核销链路接到下单（表与接口已在，前端无入口）
- [ ] 插件框架：manifest、hook 与熔断、配置表单自动生成、插件管理页
- [ ] git URL 直接安装：preview 权限清单 / 异步安装任务 / 进程监管 / 回滚
- [ ] 插件 SDK + `sparrow-plugin` CLI（`dev` / `check`）
- [ ] 索引源：官方 JSON 索引（只发现与提示更新，不自动升级）
- [ ] 节点流量排行、仪表盘趋势图（节点维度）
- [ ] 邮件 / Telegram 通知插件，站内信、到期提醒、流量预警
- [ ] IP 白名单、设备限制、限速（面板侧下发）
- [ ] Agent：Xray 支持、命令长轮询、自更新、本地缓存、metrics
- [ ] 系统设置可视化、公告与首页内容管理

## P2 · 扩展（目标：生态化）

- [ ] 容器化插件运行时（Docker 强隔离 + 出网代理白名单）
- [ ] 插件签名（ed25519）与"已验证"标识
- [ ] 插件索引市场（UI 浏览 + 一键安装，本质还是 git URL）
- [ ] 节点三方源：批量导入 + 差异预览
- [ ] 节点批量导入导出（CSV/JSON）
- [ ] ACME 自动签发证书
- [ ] 节点分组倍率、订阅分组
- [ ] Telegram Bot（用户侧自助）
- [ ] 繁体中文、多语言补全
- [ ] 用户 API Token 开放能力（对外 SDK）
- [ ] OpenTelemetry 接入、Prometheus 指标、告警

## P3 · 规模化

- [ ] 多租户 / 多站点
- [ ] 分销返佣体系
- [ ] 工单系统
- [ ] 多币种
- [ ] 数据导出与合规工具
- [ ] 插件间依赖与插件 UI 扩展

## 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| Agent 与面板签名不一致 | 全部节点失联 | 共享测试向量 + CI 契约测试 |
| 内核配置渲染错误 | 用户连不上 | 下发前 JSON 校验 + Agent 侧保留旧配置回滚 |
| 支付回调重复 | 重复开通 | 幂等约束 + 状态机校验 |
| 流量丢失 | 用户配额不准 | 进程内计数 + Agent 本地缓冲补报（seq 幂等） |
| 插件拖垮面板 | 全站不可用 | 超时 + 熔断 + 外置进程 |
| 面板与 Agent 版本不匹配 | 通信失败 | `minAgentVersion` + 灰度升级 |
| 多副本部署时定时任务重复执行 | 重复扣减/重复开通 | `pg_try_advisory_lock` 选主 |
