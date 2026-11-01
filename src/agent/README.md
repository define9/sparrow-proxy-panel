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
deploy/                systemd 单元、安装脚本、配置示例
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
