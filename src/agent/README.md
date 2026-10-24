# sparrow-agent

部署在代理节点上的单二进制 CLI（Go）。

| 能力 | 状态 |
|---|---|
| 工程骨架（子命令、版本信息） | ✅ |
| 配置解析 / 注册 / HMAC 签名 | 规划中（P0） |
| 心跳 / 拉取配置 / 上报流量 | 规划中（P0） |
| sing-box 内核管理 | 规划中（P0） |
| Xray 内核管理 | 规划中（P1） |
| 命令长轮询 / 自更新 / 离线容错 | 规划中（P1） |

设计文档：[docs/architecture/agent-cli.md](../../docs/architecture/agent-cli.md)

## 与面板的契约

Agent 的请求/响应结构由 `packages/contracts` 定义，Go 客户端代码由 OpenAPI 生成：

```bash
# 1. 生成 OpenAPI（仓库根目录）
pnpm gen

# 2. 生成 Go 客户端（需要 Go + oapi-codegen）
cd src/agent
go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest
oapi-codegen --config oapi-codegen.yaml ../../packages/contracts/openapi.json > internal/client/api.gen.go
```

CI 会校验生成物是否漂移（`pnpm gen:check`），因此**不要手改** `api.gen.go`。

## 本地开发

```bash
cd src/agent
go run ./cmd/sparrow-agent version
go test ./...
```
