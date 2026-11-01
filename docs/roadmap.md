# 路线图

粒度为"可交付、可验收"。**本文档是唯一的进度记录**：`[x]` 已完成、`[~]` 部分覆盖、`[ ]` 未开始。

## 当前能力（一句话版）

可以部署、可以注册登录、可以买套餐（演示支付）、可以给订阅链接、可以接节点并看到流量，
个人设置里的资料 / 改密 / 登录设备 / API Token 均已真实落库；
**还不能接真实支付渠道**，**外部插件安装尚未实现**，Agent 未做真机内核联调。

---

## P0 · MVP（目标：单站点可运营）

### 工程基线

- [x] monorepo：pnpm workspaces + `packages/contracts` + Go module
- [x] Next.js 骨架：App Router、Tailwind 4 + shadcn、明暗模式
- [x] 数据模型：31 张表、迁移已应用、seed 脚本（可重复执行）
- [x] 后端分层：route → service → db，`pnpm check:layers` 门禁（77 个 handler 全绿）
- [x] 部署物：Dockerfile（standalone）+ compose（内置 caddy / 外部 caddy 两种）+ 一键脚本
- [ ] CI：lint / typecheck / build / `check:layers` / 迁移漂移
- [ ] Renovate 依赖更新

### 认证与用户

- [x] 登录 / 登出 / 会话（`sessions` 表）/ RBAC 权限点 / 登录日志
- [x] 注册 + 邮箱验证码（配置了 provider 真发信，否则返回 devCode）
- [x] 找回密码：`forgot` → `reset`（改密后吊销该用户全部会话）
- [x] 站点初始化向导 `/setup`（建超管、并发安全、公网需 SETUP_TOKEN）
- [ ] 2FA（TOTP）UI 与恢复码
- [x] 个人资料/密码修改真正落库（`/user/profile` `/user/password` `/user/sessions` `/user/tokens`；2FA、通知偏好仍未做）

### 商品 / 订单 / 支付

- [x] 商品：用户端列表/详情、公开接口、管理端 CRUD + 复制 + 上下架
- [x] 订单：创建（库存扣减）、列表、详情、取消、状态机
- [x] 管理端：手动完成（开通订阅）、退款（订阅置 cancelled）、导出
- [x] 支付渠道**配置化**：`payment-epay` / `payment-stripe` 由插件 manifest 声明字段，
      配置存 `plugins.config`、密钥 AES-GCM 加密、`••••` 回写不覆盖、测试连接逐项校验
- [~] 下单支付：内置演示结算（`mode: demo|gateway`），**未对接真实网关**
- [ ] 易支付对接：`submit` 跳转、MD5 验签、异步回调幂等、对账
- [ ] 优惠券核销接到下单（表与接口已在，前端无入口）

### 订阅 / 流量

- [x] 订阅：列表/详情、格式切换（v2ray / clash / sing-box）、设备数/限速字段
- [x] 输出：`/sub/{token}`（三格式）+ `/sub/{token}/info`，支持过期/超量提示文本
- [x] 流量：Agent 上报 → `traffic_logs` → `traffic:flush` 聚合成 `traffic_daily`
- [x] 用户端与管理端的流量趋势接口读真实数据
- [ ] 配额判定收敛到 `lib/quota.ts`（当前逻辑散在订阅相关 service）
- [ ] IP 白名单 / 设备数限制在节点侧生效

### 节点 / Agent

- [x] 节点 CRUD、节点组、证书、配置渲染骨架、同步命令（`reload_config`）
- [x] Agent 协议：注册 / 心跳 / 配置（304）/ 流量（seq 幂等）/ 命令长轮询 + HMAC
- [x] 签名对齐：4 组固定向量写入 [agent-sign-vectors](architecture/agent-sign-vectors.md)
- [x] Go Agent：状态持久化、指数退避、优雅退出、离线缓存
- [x] 内核统计：sing-box（Clash API）/ xray（`api statsquery`）
- [x] 自更新：sha256 + ed25519 + 原子替换 + 回滚；systemd / install.sh / 发布脚本
- [x] 面板分发：`deploy/build-agent.sh` 产出二进制 + `latest.json`，节点一条命令安装
- [ ] **真机联调**：真实 sing-box 承载流量 → 面板曲线（MVP 验收最后一条）
- [ ] 灰度升级（按节点分批）

### 管理端

- [x] 仪表盘、商品、订单、订阅、节点、节点组、证书、用户、优惠券、日志、设置
- [x] 设置页五个 Tab：站点 / 注册 / 支付（渠道卡片）/ 邮件（provider）/ 权限
- [x] 插件列表 + 定时任务查看；安装接口显式 501（不假装成功）
- [x] 手动触发定时任务（`POST /admin/jobs/{name}/run`）
- [ ] 插件 git URL 安装流水线（接口、preview、进程监管）

### 定时任务

- [x] `instrumentation.ts` + `pg_try_advisory_lock`
- [x] `traffic:flush`(30s) / `subscription:expire`(10min) / `node:health`(1min)
- [x] 每次执行写 `task_runs`
- [ ] `traffic:rollup`（小时/月汇总）与 `log:prune`（分区裁剪）

### 前端

- [x] shadcn 基座、主题切换、Toaster、Sidebar、命令面板、面包屑
- [x] 权限驱动菜单；分组在图标态退化为直达链接
- [x] 用户端 9 页 + 管理端 13 页，全部接真实接口
- [x] 境外访问优化：菜单悬停预取、路由骨架、`staleTime 60s`、列表保留旧数据
- [~] i18n：导航与通用词已翻；页面文案仍为中文硬编码
- [ ] 移动端逐页验收

---

## P1 · 可运营（能真实对外接单）

- [ ] 易支付真实对接（下单/验签/回调/对账）
- [ ] 通知邮件接线：订单支付成功、到期提醒、流量预警（复用 `sendMail`）
- [ ] 通知渠道插件：Telegram
- [ ] 插件运行时：git URL 安装（preview → 异步安装 → 进程监管 → 回滚）
- [ ] 插件 SDK + `sparrow-plugin` CLI（dev / check）
- [ ] 索引源：官方 JSON 索引（只发现，不自动升级）
- [ ] 节点流量排行、按节点仪表盘
- [ ] 优惠券前端入口与核销
- [ ] 2FA（TOTP）与恢复码
- [ ] CI/CD（GitHub Actions：构建镜像推 ghcr.io、契约漂移、迁移漂移）

## P2 · 扩展（生态化）

- [ ] 容器化插件运行时（Docker 强隔离 + 出网白名单）
- [ ] 插件签名（ed25519）与"已验证"标识
- [ ] 插件索引市场（浏览 + 一键安装，本质仍是 git URL）
- [ ] 节点三方源：批量导入 + 差异预览
- [ ] 节点批量导入导出（CSV/JSON）
- [ ] ACME 自动签发证书
- [ ] 节点分组倍率、订阅分组
- [ ] Telegram Bot（用户侧自助）
- [ ] 繁体中文、多语言补全
- [ ] 用户 API Token 开放能力（对外 SDK；签发/吊销已落库，PAT 鉴权未接入）
- [ ] OpenTelemetry / Prometheus 指标与告警

## P3 · 规模化

- [ ] 多租户 / 多站点
- [ ] 分销返佣体系
- [ ] 工单系统
- [ ] 多币种
- [ ] 数据导出与合规工具
- [ ] 插件间依赖与插件 UI 扩展

---

## 验收标准（P0）

- [x] 注册 → 下单 → 支付（演示）→ 订阅链接 → 订阅可访问
- [ ] 客户端能连上节点（需要真机内核联调）
- [ ] 流量出现在面板并被聚合（接口已通，待真机数据）
- [ ] 面板不可达时节点继续服务（Agent 缓存已实现，待真机验证）
- [x] `pnpm lint` / `typecheck` / `build` / `check:layers` 全绿
- [ ] CI 门禁生效
- [x] Agent 签名与面板 canonical 一致（4 组向量 + 独立实现复核）

## 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| Agent 与面板签名不一致 | 全部节点失联 | 固定测试向量 + 双方各自断言 |
| 内核配置渲染错误 | 用户连不上 | 下发前校验 + Agent 保留旧配置回滚 |
| 支付回调重复 | 重复开通 | `trade_no` 唯一约束 + 状态机 |
| 流量丢失 | 配额不准 | 进程内计数 + Agent 本地缓冲补报（seq 幂等） |
| 插件拖垮面板 | 全站不可用 | 超时 + 熔断 + 外置进程（未实现，当前仅内置插件） |
| 面板与 Agent 版本不匹配 | 通信失败 | `minAgentVersion` + 灰度升级 |
| 多副本定时任务重复 | 重复扣减 | `pg_try_advisory_lock`（单实例为无锁） |
| 密钥丢失（MASTER_KEY） | 节点密钥不可解 | 部署文档要求单独备份 |
