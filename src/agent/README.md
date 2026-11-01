# sparrow-agent

部署在代理节点上的单二进制程序：注册、心跳、拉配置、上报流量、守护内核。
设计文档见 [docs/architecture/agent-cli.md](../../docs/architecture/agent-cli.md)，
签名向量见 [docs/architecture/agent-sign-vectors.md](../../docs/architecture/agent-sign-vectors.md)。

## 构建

```bash
cd src/agent
make build          # → bin/sparrow-agent（CGO 关闭，静态链接）
make test           # go test ./...
make cross          # 多平台产物
```

## 上线

```bash
# 1. 面板「节点管理」创建节点，拿到一次性注册令牌
# 2. 节点上执行
sudo ./sparrow-agent register --url https://panel.example.com --token <token>
sudo ./sparrow-agent doctor        # 自检：配置 / 内核 / 面板连通
sudo systemctl enable --now sparrow-agent
sparrow-agent status
```

注册会把 `node_id` / `node_secret` 写回 `/etc/sparrow-agent/config.yaml`（权限 0600）。

## 目录

```
cmd/sparrow-agent/     入口与子命令（run / register / status / config / doctor / update）
internal/
  config/              YAML 加载、默认值、环境变量覆盖、回写凭据
  sign/                HMAC canonical 与 4 组固定向量（与面板逐字节一致）
  model/               线协议 DTO
  client/              签名 HTTP 客户端（注册/心跳/配置/流量/命令）
  agent/               主循环：心跳、配置轮询、流量上报、命令长轮询、内核守护
  traffic/             累计值 → 增量，失败缓存与 seq
  core/                内核抽象与进程管理（sing-box / xray）
  health/              doctor 自检与本地 /healthz、/metrics
  update/              自更新（下载 → 校验 → 原子替换 → 回滚）
deploy/                systemd 单元、安装脚本、release 清单示例
scripts/               发布脚本（交叉编译 + latest.json + ed25519 签名）
```

## 运行循环

```
启动 → 载入配置 → 拉一次配置并应用
  ├─ heartbeat  每 30s   上报状态/负载/在线数
  ├─ config     每 300s  按版本拉配置（304 跳过）
  ├─ traffic    每 30s   读内核累计值 → 做差 → 上报（失败进 backlog）
  ├─ command    长轮询    执行 reload/restart/sync 等并回执
  └─ supervise  每 15s   内核不在运行时拉起
SIGTERM → 停循环 → 刷一次流量 → 停内核 → 退出
```

## 自更新

`internal/update` 实现了「下载 → sha256 → ed25519 → 原子替换 → `--version` 自检 → 失败回滚」。
`cmd update` 的调用签名固定为 `Check(ctx, cfg)` / `Apply(ctx, cfg, currentBin, release)`。

### 清单格式（latest.json）

放在自有源上（例如 `https://cdn.example.com/sparrow-agent/latest.json`），用 `update.custom_url` 指向它：

```json
{
  "version": "0.2.0",
  "channel": "stable",
  "assets": {
    "linux-amd64": "https://cdn.example.com/sparrow-agent/0.2.0/sparrow-agent-linux-amd64",
    "linux-arm64": "https://cdn.example.com/sparrow-agent/0.2.0/sparrow-agent-linux-arm64"
  },
  "sha256": {
    "linux-amd64": "e3b0c442…b855",
    "linux-arm64": "9f86d081…f00a"
  },
  "signature": "base64(ed25519(sha256 字典的 canonical JSON))"
}
```

- 平台键 = `<GOOS>-<GOARCH>`，与 `make cross` 产物一一对应；32 位 arm 统一记作 `linux-armv7`
- 签名对象是 **`sha256` 字典整体**的 canonical JSON：键按字母序、分隔符 `,` / `:`、无任何空格，
  例如 `{"linux-amd64":"…","linux-arm64":"…"}`。这样即使只改一个平台的摘要，签名也会失效
- `signature` 只在配置了 `update.public_key` 时才强制校验；公钥支持 `base64`、`ed25519:base64`、PEM 三种写法
- 样例见 [`deploy/release.example.json`](deploy/release.example.json)

### 三种源

| `update.source` | 行为 |
|---|---|
| `custom-url` | GET `update.custom_url` → 解析 latest.json → 与 `CurrentVersion()` 比较 |
| `github` | `update.custom_url` 填 `owner/repo`（或仓库 URL），请求 `api.github.com/repos/<owner>/<repo>/releases/latest`，取资产 `sparrow-agent-<os>-<arch>`；sha256 依次尝试 asset digest → `checksums.txt`/`sha256sums.txt` → `<asset>.sha256`，都拿不到就拒绝升级。未认证限流 60 次/小时，可设 `GITHUB_TOKEN` |
| `panel` | **未实现**：面板尚未提供 `GET /api/v1/public/agent/release`，`Check` 直接返回明确错误，不假装成功。在面板补上该接口前，请用 `custom-url` 或 `github` |

### `update --check` 的语义

`Check` 只有在「源不可用 / 清单非法 / 没有当前平台产物 / sha256 缺失」时才返回 error。
版本比较结果放在 `release.UpToDate`：

| 情况 | 返回 | `update --check` 表现 |
|---|---|---|
| 检查失败（网络、清单、平台不支持） | `nil, err` | 打印错误，退出码 1 |
| 已是最新 | `release, nil`，`UpToDate=true` | 打印「当前版本 X，最新版本 X」 |
| 有新版本 | `release, nil`，`UpToDate=false` | 打印「当前版本 X，最新版本 Y」 |

`Apply` 遇到 `UpToDate=true` 是幂等的 no-op，所以 `sparrow-agent update` 在最新版本上依然成功退出。
非语义化版本（`dev`、`git describe` 的 hash）按 `0.0.0-0` 处理，总是可以升级到正式版本。

### 校验与替换流程

1. 下载到 `<当前二进制>.new`：流式落盘，单文件上限 100MiB，总超时 5 分钟
2. 边写边算 sha256，与清单不一致 → 删除 `.new` 并返回 `ErrChecksumMismatch`
3. 配置了 `public_key` 时验签；清单缺 `signature` → `ErrSignatureRequired`，验签失败 → `ErrSignatureInvalid`
4. `chmod 0755` → 当前二进制改名 `<bin>.bak` → `rename` 原子替换
5. 执行 `<bin> --version` 探测新版本；失败则删除新文件、把 `.bak` 还原回去并返回错误

任何一步失败都不会留下 `.new`，也不会破坏正在运行的二进制。成功时保留 `.bak`（上一版本），
新版本要重启后才生效：`systemctl restart sparrow-agent`。

日志走 `log/slog`：`开始下载 / 下载完成 / sha256 校验通过 / 验签通过 / 二进制已替换 / 新版本自检通过 / 升级完成`。

## 发布与安装

### 产物命名

```bash
cd src/agent
make cross     # CGO_ENABLED=0，产物在 bin/
```

| 文件 | 平台键 |
|---|---|
| `bin/sparrow-agent-linux-amd64` | `linux-amd64` |
| `bin/sparrow-agent-linux-arm64` | `linux-arm64` |
| `bin/sparrow-agent-linux-armv7` | `linux-armv7`（GOARCH=arm） |
| `bin/sparrow-agent-darwin-arm64` | `darwin-arm64` |
| `bin/sparrow-agent-darwin-amd64` | `darwin-amd64` |
| `bin/sparrow-agent-windows-amd64.exe` | `windows-amd64` |

### 一条命令生成发布物

```bash
VERSION=0.2.0 \
BASE_URL=https://cdn.example.com/sparrow-agent \
KEY=release.key \
sh scripts/release.sh
```

会做：`make cross` → 把产物复制到 `dist/release/<version>/` → 生成 `SHA256SUMS` →
生成 `dist/release/latest.json` → 用 `scripts/release-sign` 对 sha256 字典签名（`KEY` 为空则跳过签名）。

密钥管理：

```bash
go run ./scripts/release-sign keygen            # 生成 release.key（0600）/ release.pub
go run ./scripts/release-sign verify --pub "$(cat release.pub)" --manifest dist/release/latest.json
```

公钥填进节点配置的 `update.public_key`，私钥离线保存，**不要提交进仓库**。

### 上传 GitHub Release

```bash
gh release create agent/v0.2.0 dist/release/0.2.0/* --title "agent v0.2.0"
```

节点侧配 `update.source: github`、`update.custom_url: owner/repo` 即可自更新；
`latest.json` 也可以同步到自有源给 `custom-url` 用。

### install.sh

```bash
# 面板已提供下载/清单接口时（当前尚未实现，会显式报错并提示兜底）
sudo ./install.sh --url https://panel.example.com --token <token>

# 面板接口未实现时的兜底：自带地址 + 校验值
sudo ./install.sh --url https://panel.example.com --token <token> \
  --from-url https://cdn.example.com/sparrow-agent/0.2.0/sparrow-agent-linux-amd64 \
  --sha256 <64 位 hex>

# 先看要做什么，不改系统
sudo ./install.sh --url https://panel.example.com --token t --dry-run

# 其它开关
./install.sh --help
```

脚本行为（幂等，可重复执行，升级时会先停服务再替换二进制）：

1. 校验 root、`uname` 架构（amd64 / arm64 / armv7）
2. 解析二进制地址：`--from-url` > release 清单 `assets` > `$PANEL/api/v1/public/agent/download/...`
3. **必须**校验 sha256（`--sha256` 或清单里的值），拿不到校验值就中止，绝不安装未校验的二进制
4. 备份旧二进制为 `/usr/local/bin/sparrow-agent.bak`，安装新文件（0755）
5. 写入 `/etc/sparrow-agent/config.yaml`（0600，从 `deploy/config.example.yaml` 生成并把 `panel.url` 换成 `--url`；
   已存在时默认保留，加 `--force` 覆盖）
6. 创建 `/var/lib/sparrow-agent`、`/var/log/sparrow-agent.log`
7. 安装 `sparrow-agent.service` → `daemon-reload` → `enable` → `start`（无 systemd 环境会跳过并提示）
8. 尽力注册节点（`sparrow-agent register`，失败只告警），最后打印常用命令

### 日志与排查

```bash
systemctl status sparrow-agent
journalctl -u sparrow-agent -f            # stdout（log_file 为空时看这里）
tail -f /var/log/sparrow-agent.log        # 配置了 agent.log_file 时
sparrow-agent doctor -c /etc/sparrow-agent/config.yaml
sparrow-agent update --check -c /etc/sparrow-agent/config.yaml
```

升级失败想看现场：`/usr/local/bin/sparrow-agent.bak` 是上一版本，
直接 `mv sparrow-agent.bak sparrow-agent` 即可手工回滚。
