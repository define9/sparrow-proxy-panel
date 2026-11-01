# ADR-0001：仓库结构采用 Monorepo

- 状态：已接受
- 日期：2026-10-24
- 相关：[tech-stack](tech-stack.md)、[api-design](api-design.md)、[agent-cli](agent-cli.md)

## 背景

项目由两部分组成：

1. **Panel** —— Next.js 全栈面板（用户端 + 管理端 + 服务端）
2. **Agent** —— 部署在代理节点上的 CLI，负责拉取配置、上报状态与流量

两者之间存在一份**硬契约**：节点配置结构、订阅链接格式、请求签名算法、流量上报数据结构、命令下发格式。这份契约的任何变更都必须在两端同步，且**变更不同步的后果是线上故障**——节点通常没有公网调试环境，字段不兼容只能等用户报障。

## 决策

采用 **Monorepo**：单一 Git 仓库，内部用 pnpm workspaces 管理 TypeScript 侧，用独立的 Go module 管理 Agent。

```
sparrow-proxy-panel/
├── src/
│   ├── panel/            # Next.js 全栈面板（用户指定位置）
│   └── agent/            # Go CLI，与 TS 侧零源码依赖
├── packages/
│   ├── contracts/        # 跨端契约源（zod → OpenAPI → Go 代码）
│   └── config/           # 共享 eslint / tsconfig / prettier
├── docs/                 # 产品与技术文档
├── deploy/               # docker / compose / k8s
├── tools/                # 代码生成与本地编排脚本
└── pnpm-workspace.yaml   # 工作区定义
```

### 依赖方向（强约束）

```
packages/contracts  ──►  src/panel   （被依赖）
       │
       └──► 生成产物 ──► src/agent   （被依赖，无源码耦合）
```

- `src/panel` 可以 import `@sparrow/contracts`
- `src/agent` **不得** import 任何 `src/panel` 的代码，只消费 `packages/contracts` 生成的 OpenAPI 客户端与 JSON Schema
- `packages/contracts` 不依赖任何业务代码，只放 schema / DTO / 常量 / 权限点

## 为什么不是 Multirepo

| 维度 | Monorepo | Multirepo |
|---|---|---|
| 契约一致性 | 一次 commit 改完两端，CI 可做生成物 diff 校验 | 靠人工同步，需要维护版本兼容矩阵 |
| CI 成本 | 一次 push 跑全量（契约生成 → Go client → 兼容性测试） | N 份流水线，重复配置 |
| 跨端联调 | 本地一条命令同时起面板与 mock agent | 需跨仓库版本对齐 |
| 独立发版 | 需要额外配置 | 天然支持 |
| 权限与安全边界 | 弱 | 强 |

**决定性因素是契约一致性**，不是"代码方便"。独立发版这个缺点可以用 CI/CD 补：

- Go Agent 用 GoReleaser 打 tag，如 `agent/v1.2.0`，产出多平台二进制
- Panel 用 Changesets 私有发布或 Docker 镜像 tag，如 `panel/v0.3.0`
- 两者版本号独立演进，不互相阻塞

## 什么时候应该改成 Multirepo

以下任一条成立时，把 `src/agent` 拆出去（成本约等于一次 `git filter-repo`）：

1. Agent 需要独立开源并由不同维护者主导
2. Agent 的安全边界要求与面板代码仓库物理隔离
3. 面板走商业闭源分发，而 Agent 走公开仓库 + 镜像分发
4. 两侧 CI 资源需求严重分化（例如 Agent 需要大量多平台交叉编译）

拆分的前提是保持 `src/agent` 对 `src/panel` 的零源码依赖——这也是本 ADR 把它列为强约束的原因。

## 代价与对策

| 代价 | 对策 |
|---|---|
| CI 变慢 | 用 Turborepo/Nx 做任务图缓存；Go 与 TS 流水线拆分并行 |
| 权限边界弱 | 所有代码可见是开源项目的常态；若涉及商业闭源，用私有仓库 + 稀疏检出 |
| 依赖冲突 | pnpm 严格 node_modules 隔离；Go 侧独立 module |
| 目录约定易腐化 | 用 ESLint `import/no-restricted-paths` 强制依赖方向 |
