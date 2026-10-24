# sparrow-agent

部署在代理节点上的单二进制 CLI（Go）。

| 能力 | 状态 |
|---|---|
| 工程骨架（子命令、版本信息） | ✅ |
| 配置解析 / 校验 / 环境变量覆盖 | ✅ |
| HMAC-SHA256 签名（与面板共享测试向量） | ✅ |
| 心跳 / 拉取配置 / 上报流量 | ✅ |
| sing-box 内核管理（配置落盘 + Clash API 重载 + 进程守护） | ✅ |
| 命令长轮询 / 命令回执 | ✅ |
| 本地配置缓存与离线容错 | ✅ |
| 结构化日志 / `/metrics` / `/healthz` | ✅ |
| Xray 内核管理 | 规划中（P1） |
| Agent 自更新 | 规划中（P1） |
| 插件拉取（节点侧） | 规划中（P2） |

设计文档：[docs/architecture/agent-cli.md](../../docs/architecture/agent-cli.md)

## 目录结构

```
src/agent/
├── cmd/sparrow-agent/main.go   # 入口，解析子命令
├── internal/
│   ├── agent/      # 主循环：心跳、配置拉取、流量上报、命令长轮询
│   ├── cache/      # 本地配置缓存（面板不可达时继续服务）
│   ├── client/     # 面板 API 客户端（api.gen.go 为生成物）
│   ├── config/     # YAML 加载、默认值、校验（env 覆盖）
│   ├── core/       # 内核抽象：fake（测试）/ sing-box（真实）+ 进程守护
│   ├── health/     # 本地 /metrics 与 /healthz
│   ├── logger/     # slog JSON 日志 + 文件轮转
│   ├── metrics/    # Prometheus 文本格式指标
│   ├── sign/       # HMAC 签名与请求头
│   ├── traffic/    # 流量增量聚合 + 本地补报队列（环形，上限 5000 条）
│   └── version/    # 版本信息
├── scripts/        # 契约预处理脚本
├── testdata/
├── go.mod
└── Makefile
```

## 与面板的契约

Agent 的请求/响应结构由 `packages/contracts` 定义，Go 客户端代码由 OpenAPI 生成：

```bash
# 1. 生成 OpenAPI（仓库根目录）
pnpm gen

# 2. 生成 Go 客户端（需要 Go + oapi-codegen >= v2.8）
cd src/agent
make install-tools          # go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.1
make generate               # 预处理契约 + 生成 internal/client/api.gen.go
```

`make generate` 会先运行 `scripts/prepare_openapi.py`：契约里所有整型字段的
上限都是 2^53-1（字节数），而 oapi-codegen 默认生成 Go 的 `int`——在
linux/armv7、linux/mips 等 32 位平台上 `int` 只有 32 位，单用户流量超过
2GiB 就会溢出。脚本给整型字段注入官方的 `x-go-type: int64` 扩展后再生成，
**不会修改** `packages/contracts/**` 下的任何文件。

CI 会校验生成物是否漂移（`pnpm gen:check`），因此**不要手改** `api.gen.go`。

### 签名（与面板端共享测试向量）

请求头：`X-Node-Id` / `X-Timestamp`（Unix 毫秒）/ `X-Nonce` / `X-Signature`。

canonical（**必须逐字节一致**）：

```
METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
```

- METHOD 大写；PATH 为请求路径（含前导 `/`，不含查询串）
- SHA256(body) 为请求体的十六进制摘要（小写）；body 为空时用空串的 SHA-256
- 签名 = HMAC-SHA256(secret, canonical) 的小写十六进制

固定测试向量见 `internal/sign/sign_test.go`（面板端必须使用同一组）：

| # | METHOD | PATH | secret | timestamp | nonce | canonical | signature |
|---|---|---|---|---|---|---|---|
| 1 | POST | /api/v1/agent/heartbeat | unit-test-key-01 | 1761264000000 | 0123456789abcdef0123456789abcdef | `POST\n/api/v1/agent/heartbeat\n1761264000000\n0123456789abcdef0123456789abcdef\n5fe0650565b951068f8c8209f16bdec5aa7f7ce5e5a73c6016abf13a2b49e4c8` | `ab120e50f708b2ca498ae9578e3e686af83d70ceb3a8b9ca074c85fc83f62150` |
| 2 | GET | /api/v1/agent/config | unit-test-key-01 | 1761264000123 | fedcba9876543210fedcba9876543210 | `GET\n/api/v1/agent/config\n1761264000123\nfedcba9876543210fedcba9876543210\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `b825af54702e4316b271b384da63142b779e4d4d6e23905bcd60d90397287e04` |
| 3 | POST | /api/v1/agent/traffic | unit-test-key-01 | 1761264000456 | a1b2c3d4e5f60718293a4b5c6d7e8f90 | `POST\n/api/v1/agent/traffic\n1761264000456\na1b2c3d4e5f60718293a4b5c6d7e8f90\nd1a816c8491518113aa3942c6211874bcd2ec1bd0a45c63577dd4d50952fae4f` | `aead0d567f87540b33194ccbb7fe483a6d2b4f0a1caa85b1a4668944093e823a` |
| 4 | POST | /api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack | unit-test-key-02 | 1761264000789 | 00112233445566778899aabbccddeeff | `POST\n/api/v1/agent/commands/9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d/ack\n1761264000789\n00112233445566778899aabbccddeeff\neaa741c84539b243de843ff8f1b5577d7c43429d0a636d22df0ce61e2794a02c` | `c7853b08ace85abb4743193d03369bafcdcdf20d7358b5050c294d3b0928bcd1` |

> 上表中的 secret 仅为**测试用**固定值；面板端请使用同一组测试向量。

## 配置

```yaml
panel:
  url: "https://panel.example.com"
  node_id: "uuid"           # 注册后由面板下发
  node_secret: "••••"       # 建议改用环境变量注入

core:
  type: "sing-box"          # sing-box | xray | fake（测试用）
  binary: "/usr/local/bin/sing-box"
  config_path: "/etc/sparrow-agent/core.json"
  version_constraint: ">=1.12.0 <2.0.0"
  clash_api: "127.0.0.1:9091"   # 内核本地管理 API（用于热重载与流量统计）

agent:
  data_dir: "/var/lib/sparrow-agent"
  heartbeat_interval: 30s
  config_poll_interval: 300s
  command_poll_timeout: 25s
  traffic_report_interval: 30s
  max_backoff: 5m
  log_level: "info"
  log_file: "/var/log/sparrow-agent.log"
  metrics_addr: "127.0.0.1:9090"

tls:
  ca_file: ""
  insecure: false
  server_name: ""

update:
  enabled: true
  channel: "stable"
  source: "panel"
```

环境变量覆盖（容器场景，敏感项优先从环境读取）：
`SPARROW_PANEL_URL`、`SPARROW_NODE_ID`、`SPARROW_NODE_SECRET`、
`SPARROW_REGISTRATION_TOKEN`、`SPARROW_DATA_DIR`、`SPARROW_LOG_LEVEL`、`SPARROW_CORE_TYPE`。

## 子命令

```bash
sparrow-agent run [-c config.yaml]      # 前台运行（systemd ExecStart）
sparrow-agent register --url --token    # 注册并写入配置
sparrow-agent status                   # 本地状态（配置版本、待补报条数等）
sparrow-agent config                   # 打印当前生效配置（脱敏）
sparrow-agent doctor                   # 自检：配置、内核、数据目录、面板连通性
sparrow-agent version                  # 版本信息
```

## 运行循环

```
启动
 ├─ 加载配置（校验；缺 node_id 则提示先 register）
 ├─ 应用本地缓存配置（面板不可达时的离线容错）
 ├─ 启动内核进程（崩溃自动拉起，退避 30s → 1m → 5m）
 └─ 四个独立 goroutine（各自指数退避，互不阻塞）
      ├─ 心跳       每 30s  → POST /api/v1/agent/heartbeat
      ├─ 配置轮询   每 300s → GET  /api/v1/agent/config（304 跳过）
      ├─ 流量上报   每 30s  → POST /api/v1/agent/traffic（只报增量，失败进环形缓冲）
      └─ 命令长轮询 25s     → GET  /api/v1/agent/commands → 执行 → POST .../ack
```

## 本地开发

```bash
cd src/agent
go run ./cmd/sparrow-agent version
go test ./...
make build      # 产出 dist/sparrow-agent
```

测试里包含一个**可离线运行的假面板**（`internal/agent/fake_panel_test.go`），
覆盖完整流程：注册 → 心跳 → 拉配置 → 上报流量 → 收到命令并 ack，
以及「上报失败进本地缓冲、恢复后补报」「面板不可达时使用缓存配置」等场景。
测试不会启动真实内核（使用 `core.Fake`）。
