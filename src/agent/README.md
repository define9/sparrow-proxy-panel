# Sparrow Agent

部署在代理节点上的单二进制程序：注册、心跳、拉配置、上报流量、守护内核。
设计文档见 [docs/architecture/agent-cli.md](../../docs/architecture/agent-cli.md)，
签名向量见 [docs/architecture/agent-sign-vectors.md](../../docs/architecture/agent-sign-vectors.md)。

## 它在哪

**和面板在同一个仓库**：`src/agent/`（Go module，`go.mod`）。不单独发仓库。

```
src/agent/
├── cmd/sparrow-agent/     入口与子命令
├── internal/              config / sign / model / client / agent / traffic / core / health / update
├── deploy/                systemd 单元、install.sh、config.example.yaml
├── scripts/               release.sh、release-sign
└── Makefile
```

## 怎么执行

### 方式一：面板直接分发（推荐，节点无需 Go）

面板服务器上构建一次（宿主机只需 Docker，用 `golang` 镜像交叉编译）：

```bash
cd deploy
./build-agent.sh              # 产出 agent-dist/{二进制×3, install.sh, latest.json}
docker compose up -d panel    # 挂载到 /app/src/panel/public/agent
```

节点上**一条命令**：

```bash
curl -fsSL http://localhost/agent/install.sh | sudo sh -s -- \
  --url http://localhost \
  --token <一次性令牌> \
  --manifest http://localhost/agent/latest.json
```

`install.sh` 会：校验 sha256 → 装二进制 → 写 `/etc/sparrow-agent/config.yaml`（0600）→
调 `register` → 装 systemd 单元 → 启动。**幂等**，重复执行即升级。

### 方式二：本地编译（开发机）

```bash
cd src/agent
make build          # → bin/sparrow-agent
make test           # go test ./...
make cross          # 交叉编译多平台产物
```

手动注册：

```bash
./bin/sparrow-agent register --url https://panel.example.com --token <一次性令牌>
./bin/sparrow-agent run -c /etc/sparrow-agent/config.yaml
```

### 令牌从哪来

面板 → **节点管理 → 新建节点** → 创建后弹窗直接给出注册命令（含真实域名与一次性令牌），点「复制命令」即可。
令牌一次性使用，注册成功后即失效。

## 子命令

| 命令 | 说明 |
|---|---|
| `run [-c config.yaml]` | 前台运行（systemd ExecStart） |
| `register --url URL --token TOKEN` | 注册节点并写入配置（`--url` 可省略，用配置里的 `panel.url`） |
| `status` | 本地状态（读 state.json + 探测内核进程） |
| `config` | 打印生效配置（密钥脱敏） |
| `doctor` | 自检：配置 / 内核二进制 / 内核进程 / 面板连通 |
| `update [--check]` | 自更新（sha256 + ed25519 + 原子替换 + 回滚） |
| `version` | 版本信息 |

## 配置

`/etc/sparrow-agent/config.yaml`（模板见 `deploy/config.example.yaml`）：

```yaml
panel:
  url: "https://panel.example.com"
  node_id: ""          # register 自动写入
  node_secret: ""      # register 自动写入
core:
  type: "sing-box"     # sing-box | xray
  binary: "/usr/local/bin/sing-box"
  config_path: "/etc/sparrow-agent/core.json"
agent:
  data_dir: "/var/lib/sparrow-agent"    # state.json 与缓存
  heartbeat_interval: 30s
  config_poll_interval: 300s
```

环境变量可覆盖敏感项（容器场景）：`SPARROW_PANEL_URL`、`SPARROW_NODE_ID`、`SPARROW_NODE_SECRET`。

## 运行循环

```
启动 → 载入 state.json → 拉一次配置并应用
  ├─ heartbeat  每 30s   上报状态/负载/在线数
  ├─ config     每 300s  按版本拉配置（304 跳过）
  ├─ traffic    每 30s   读内核累计值 → 做差 → 上报（失败进 backlog）
  ├─ command    长轮询    执行 reload/restart/sync 并回执
  └─ supervise  每 15s   内核不在运行时拉起
SIGTERM → 停循环 → 刷一次流量 → 停内核 → 退出
```

## 节点还需要什么

Agent 只管拉起与热重载内核，**内核要自己装**：

```bash
curl -fsSL https://sing-box.app/install.sh | sudo sh
```

内核路径不是默认的，改 `config.yaml` 的 `core.binary`。

## 本地联调（不装 systemd）

```bash
cd src/agent && make build
mkdir -p /tmp/agent && cp deploy/config.example.yaml /tmp/agent/config.yaml
# 改 url / data_dir / core.binary / core.config_path
# 用一个假内核脚本冒充 sing-box：
printf '#!/bin/sh\nif [ "$1" = "version" ]; then echo "sing-box version 1.12.0"; exit 0; fi\nif [ "$1" = "check" ]; then exit 0; fi\nif [ "$1" = "run" ]; then sleep 3600; fi\n' > /tmp/agent/fake-singbox
chmod +x /tmp/agent/fake-singbox

./bin/sparrow-agent register -c /tmp/agent/config.yaml --url http://localhost --token <令牌>
./bin/sparrow-agent run -c /tmp/agent/config.yaml
```
