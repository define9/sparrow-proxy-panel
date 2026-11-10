# Agent CLI 设计

## 0.1 Agent 的分发形态（为什么二进制不进面板）

Agent 与 Panel 是同一套协议、同一份签名向量，属于同一个产品，**面板引导安装是它的本职**；
但**面板不托管二进制**——7MB 文件 99.99% 的时间不参与运行，塞进镜像纯属浪费。

```
面板（只提供元信息与安装脚本）
├── GET /agent/install.sh                     几 KB 纯文本，随面板构建期拷贝
└── GET /api/v1/public/agent/release          发布元信息：版本 + 各平台 url + sha256
                    │
                    ▼ 节点执行
curl .../agent/install.sh | sudo sh -s -- --url <面板> --token <令牌>
                    │
                    ▼ 脚本按元信息从 GitHub Release 下载二进制，校验 sha256 后安装
```

| 方案 | 面板镜像 | 节点安装 | 结论 |
|---|---|---|---|
| 外挂 `agent-dist/` 目录 | 316MB | 需先在面板服务器跑 `build-agent.sh` | ❌ 多一步、易漏 |
| 产物内置镜像（已否决） | +20MB | 一条命令 | ❌ 镜像里 99.99% 用不到 |
| **面板给元信息 + GitHub Release（采用）** | +0MB | 一条命令 | ✅ 面板无负担，版本可独立发布 |

**边界**：
- 面板**不**托管二进制、**不**在运行期编译 Agent（编译是 CI 的活）
- 面板**不**执行任何来自第三方仓库的代码（见 [plugin-system](plugin-system.md) 安全红线）
- 二进制的来源与 sha256 来自**发布流程**写入的 `settings.agent_release`，面板只读

## 0. 实现状态（2026-11）

已落地于 `src/agent/`（Go 1.24，单静态二进制，无第三方依赖，仅 yaml.v3）：

| 能力 | 状态 | 位置 |
|---|---|---|
| 配置解析 / 默认值 / 环境变量覆盖 / 凭据回写 | ✅ | `internal/config` |
| HMAC 签名（4 组固定向量） | ✅ | `internal/sign` |
| 签名 HTTP 客户端（含时钟偏差自愈、User-Agent、304） | ✅ | `internal/client` |
| 注册 / 心跳 / 配置轮询 / 流量上报 / 命令长轮询 | ✅ | `internal/agent` |
| 状态持久化（seq / configVersion / backlog，原子写） | ✅ | `internal/agent/state.go` |
| 累计值 → 增量、失败 backlog 合并重发 | ✅ | `internal/traffic` |
| 内核抽象与进程管理（sing-box / xray） | ✅ | `internal/core` |
| sing-box 统计（Clash API `/connections`） | ✅ 未真机联调 | `internal/core/singbox.go` |
| xray 统计（`xray api statsquery`） | ✅ 未真机联调 | `internal/core/xray.go` |
| 离线缓存（最后一份配置 + 证书） | ✅ 包级实现 | `internal/cache` |
| 自更新（sha256 + ed25519 + 回滚） | ✅ | `internal/update` |
| systemd 单元 / 安装脚本 / 发布脚本 | ✅ 交付未真机验证 | `deploy/`、`scripts/` |
| 面板侧命令下发 `/api/v1/agent/commands` | ✅ | `src/panel/app/api/v1/agent/commands/` |

约定与面板保持一致的两处**易错点**：

1. 首次拉配置必须发 `X-Config-Version: -1`（面板 `configVersion` 从 0 开始，发 0 会命中 304，配置永远不下发）
2. `Apply` 前要注入统计所需的本机参数（sing-box 的 `experimental.clash_api`、xray 的 `api/stats/policy`），否则拿不到 per-user 流量

尚未完成：真机内核联调、灰度升级、`/download` 面板中转下载（已决定不做：二进制走 GitHub Release，
面板只提供 `/api/v1/public/agent/release` 元信息与 `/agent/install.sh`）。

## 1. 定位

`sparrow-agent` 是部署在代理节点上的**单二进制程序**，职责边界：

| 做 | 不做 |
|---|---|
| 注册、心跳、保持与面板的连接 | 不做售卖、账号、支付 |
| 拉取并应用本节点的内核配置 | 不决定用户配额（配额由面板判定后下发） |
| 采集并上报 per-user 流量 | 不自行累计计费（面板是唯一权威） |
| 管理内核进程（Xray / sing-box） | 不做中转调度（面板决定节点组与权重） |
| 自更新、插件拉取、健康检查 | 不存用户明文凭据（只有节点级密钥） |

## 2. 技术选型与产物

| 项 | 选择 |
|---|---|
| 语言 | Go 1.24+ |
| 产物 | 单静态二进制（CGO 关闭），约 15-25MB |
| 目标平台 | linux/amd64、linux/arm64、linux/armv7、linux/mips(softfloat)、darwin/amd64、darwin/arm64、windows/amd64 |
| 配置 | YAML（`gopkg.in/yaml.v3`） |
| HTTP | 标准库 `net/http`（HTTP/2 自带） |
| 日志 | `log/slog`（结构化 JSON） |
| 依赖 | 尽量只用标准库；HTTP 客户端用 `net/http`；仅在需要时引入 |

发布：`goreleaser` 打 tag `agent/vX.Y.Z`，产物进 GitHub Releases，面板可从 Releases 或自有源下载。

## 3. 目录结构

```
src/agent/
├── cmd/sparrow-agent/main.go      # 入口，解析子命令
├── internal/
│   ├── config/                    # YAML 加载、默认值、校验（env 覆盖）
│   ├── client/                    # 面板 API 客户端（手写薄封装 + 生成模型）
│   │   └── api.gen.go             # 由 oapi-codegen 从 openapi.json 生成，勿手改
│   ├── agent/                     # 主循环：心跳、配置拉取、流量上报、命令长轮询
│   ├── sign/                      # HMAC 签名与请求构造（与面板共享测试向量）
│   ├── core/                      # 内核抽象
│   │   ├── core.go                # interface: ApplyConfig / Stats / Restart / Version
│   │   ├── singbox.go
│   │   ├── xray.go
│   │   └── stats.go               # 流量统计解析（Clash API / gRPC）
│   ├── traffic/                   # 流量采集与本地聚合（防丢）
│   ├── cache/                     # 本地配置缓存（面板不可达时使用）
│   ├── update/                    # 自更新：下载、验签、原子替换、回滚
│   ├── health/                    # 自身健康检查、metrics 端点
│   └── logger/                    # slog 配置 + 日志轮转
├── testdata/
├── go.mod
└── Makefile
```

## 4. 配置文件

`/etc/sparrow-agent/config.yaml`：

```yaml
panel:
  url: "https://panel.example.com"
  # 注册后由面板下发并写入本文件（也可手工粘贴）
  node_id: "uuid"
  node_secret: "••••"

core:
  type: "sing-box"          # sing-box | xray
  binary: "/usr/local/bin/sing-box"
  config_path: "/etc/sparrow-agent/core.json"
  # 允许面板下发的内核版本范围
  version_constraint: ">=1.12.0 <2.0.0"

agent:
  data_dir: "/var/lib/sparrow-agent"
  heartbeat_interval: 30s
  config_poll_interval: 300s
  command_poll_timeout: 25s
  max_backoff: 5m
  log_level: "info"
  log_file: "/var/log/sparrow-agent.log"

tls:
  ca_file: ""               # 自签 CA
  insecure: false
  server_name: ""           # SNI 固定，防中间人

update:
  enabled: true
  channel: "stable"         # stable | beta
  source: "panel"           # panel | github | custom-url
  custom_url: ""
  public_key: "ed25519:…"   # 校验发布签名
```

环境变量覆盖（容器场景）：`SPARROW_PANEL_URL`、`SPARROW_NODE_ID`、`SPARROW_NODE_SECRET` 等，密钥类只从环境读，不进配置文件。

## 5. 子命令

```bash
sparrow-agent run                 # 前台运行（systemd ExecStart）
sparrow-agent run -c /path.yaml   # 指定配置
sparrow-agent register --url ... --token ...   # 注册并写入配置
sparrow-agent status              # 本地状态（当前配置版本、连接状态、累计流量）
sparrow-agent config              # 打印当前生效配置（脱敏）
sparrow-agent doctor              # 自检：配置、内核、网络、面板连通性、证书
sparrow-agent update --check      # 检查新版本
sparrow-agent update              # 执行自更新
sparrow-agent version
```

## 6. 运行循环

```
启动
 ├─ 加载配置（校验；缺 node_id 则进入 register 流程）
 ├─ 初始化本地缓存（读 /var/lib/sparrow-agent/cache.json）
 ├─ 启动内核（若已安装且配置存在；否则等待首次下发）
 └─ 主循环（每个 tick 并行推进）：
      ├─ 心跳 goroutine      每 30s  → POST /agent/heartbeat
      ├─ 配置轮询 goroutine  每 300s → GET /agent/config（带版本号，304 跳过）
      │                        └─ 版本变化 → 渲染落盘 → 校验 → 应用内核 → 回执
      ├─ 流量采集 goroutine  每 30s  → 读内核统计 → 差值 → 本地聚合 → POST /agent/traffic
      └─ 命令长轮询 goroutine 25s   → GET /agent/commands → 执行 → POST ack
```

关键设计：

- **每个 goroutine 独立退避重连**，互不阻塞；一个失败不影响其他
- **流量差值语义**：Agent 维护"上次上报值"，只上报增量；重启后从内核统计绝对值做差（内核统计持久化在 `/var/lib`）
- **本地聚合缓冲**：上报失败时增量进本地文件队列（环形，最多 5000 条），恢复后补报，`seq` 保证幂等
- **优雅退出**：收到 SIGTERM → 停止拉取 → 刷一次流量 → 停内核 → 退出（`timeout 30s`）

## 7. 配置下发与应用

面板下发的是**完整内核配置**（JSON），Agent 只做本地参数注入：

```
下发配置 → 写入临时文件 → JSON 校验 → 注入本机参数（监听端口、证书路径、本机 IP）→ 备份旧配置
        → 调用内核 reload API（sing-box Clash API / Xray gRPC）→ 失败则回滚旧配置并上报事件
```

`reload` 失败时：保留旧配置继续服务，同时上报 `config_apply_failed` 事件，Agent 侧进入退避重试（30s、1m、5m）。

## 8. 流量统计

| 内核 | 统计来源 |
|---|---|
| sing-box | Clash API `/traffic` + `/connections`（需开启 `experimental.clash_api`） |
| Xray | gRPC `stats.query`（`stats: true` + `api` 配置） |

Agent 把内核的 per-user 计数（按 email 标签）映射为面板的 `uid`：

- 面板在配置里给每个用户分配稳定的 `email: u_<uuid>` 标签，Agent 直接以该标签上报
- 面板维护 `email → subscription_id` 映射（来自订阅下发配置）

## 9. 自更新

```
检查更新
 → 拉取版本清单（面板 / GitHub Releases / 自定义源）
 → 比对版本 + 校验平台与架构
 → 下载到临时文件
 → 校验 sha256
 → 校验 ed25519 签名（公钥内置于二进制 or 配置指定）
 → 备份当前二进制（/usr/local/bin/sparrow-agent.bak）
 → 原子替换（rename）
 → 重启自检（--version 探测 + 进程存活）
 → 失败 → 回滚到 .bak
```

要点：
- 内置**版本公钥**（编译进二进制），这是信任根；配置里的 `public_key` 只用于自建源
- systemd 下由 `sparrow-agent update` 自行下载，替换后 `systemctl restart sparrow-agent`（通过 `EXIT` 约定或调用 systemctl）
- 支持灰度：面板可指定节点分批升级（先 10% 观察 30 分钟）

### 9.1 发布元信息（面板只指路，不托管二进制）

二进制在 GitHub Release，面板镜像里**不放**二进制（7MB 只在安装/升级时用一次）。
面板对外提供 `GET /api/v1/public/agent/release`（公开，无需登录）：

```jsonc
{
  "version": "0.1.0",
  "channel": "stable",
  "source": "github",            // github（默认）/ custom-url（自建 CDN）/ none（未配置）
  "repo": "define9/sparrow-proxy-panel",
  "tag": "agent/v0.1.0",
  "assets": { "linux-amd64": { "url": "https://github.com/…/sparrow-agent-linux-amd64",
                               "sha256": "<64hex>" } },
  "installScript": "/agent/install.sh",
  "signature": ""
}
```

- 平台键与 `internal/update.PlatformKey()` 一致
- 数据来源：`settings` 表 key = `agent_release`，由发布流程写入
  （`src/agent/scripts/release.sh` → `panel-release.json` → `src/panel/scripts/publish-agent-release.mjs`），面板只读
- 未配置时返回 `{ "source": "none", "assets": {} }` + HTTP 200，前端提示「尚未配置 Agent 发布源」
- `install.sh` 同时兼容两种清单：本接口的 `{ url, sha256 }` 对象，和旧 `latest.json` 的
  `assets[platform] = url` + `sha256[platform] = hex`；清单来源依次尝试
  `--manifest` → `/api/v1/public/agent/release` → `/agent/latest.json`

## 10. 可观测性

| 能力 | 说明 |
|---|---|
| 结构化日志 | `log/slog` JSON 输出到 stdout（systemd journal）与文件（自动轮转） |
| 本地 metrics | `http://127.0.0.1:9090/metrics`（Prometheus 文本格式）：心跳成功率、上报延迟、配置版本、内核存活、流量速率 |
| 健康检查 | `GET /healthz` → `{"ok":true,"core":"alive","panel":"connected"}` |
| 面板侧可见 | 面板管理端展示节点在线状态、版本、延迟（心跳 RTT）、最近错误 |

## 11. systemd 单元

```ini
[Unit]
Description=Sparrow Proxy Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/sparrow-agent run
Restart=always
RestartSec=5
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/sparrow-agent /etc/sparrow-agent
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## 12. 安装方式

| 方式 | 命令 |
|---|---|
| 一键脚本 | `curl -fsSL https://panel.example.com/agent/install.sh \| sudo sh -s -- --url https://panel.example.com --token <token>` |
| 手动 | 下载二进制（GitHub Release）→ 写配置 → `systemctl enable --now sparrow-agent` |
| Docker | `docker run -d --name sparrow-agent -v /etc/sparrow-agent:/etc/sparrow-agent -v /var/lib/sparrow-agent:/var/lib/sparrow-agent <image>` |

安装脚本必须校验二进制 sha256（来自面板发布元信息 / latest.json）。

## 13. 测试策略

| 层 | 内容 |
|---|---|
| 单元 | 签名 canonical 构造、配置解析、流量差值、版本比对、备份回滚 |
| 契约 | **共享测试向量**：面板与 Agent 各跑同一组 HMAC 签名用例，防止 canonical 拼接不一致 |
| 集成 | 起一个假面板（mock server），跑完整注册→配置→上报→命令流程 |
| 端到端 | 真机（Docker + sing-box）验证配置应用与流量统计准确性 |

> 契约测试是本项目最重要的一类测试：签名与字段不一致会导致所有节点失联。
