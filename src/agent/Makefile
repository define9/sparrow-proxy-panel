GO ?= go
BINARY := sparrow-agent
CONTRACT := ../../packages/contracts/openapi.json

.PHONY: all build test vet fmt generate install-tools clean

all: vet test build

## build: 编译单二进制（关闭 CGO，便于交叉编译与分发）
build:
	CGO_ENABLED=0 $(GO) build -trimpath -o dist/$(BINARY) ./cmd/sparrow-agent

## test: 运行全部单元测试（含假面板集成测试）
test:
	$(GO) test ./...

## vet: 静态检查
vet:
	$(GO) vet ./...

## fmt: 格式化代码
fmt:
	$(GO) fmt ./...

## install-tools: 安装契约客户端生成器
install-tools:
	$(GO) install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.1

## generate: 从面板契约重新生成 Go 客户端（internal/client/api.gen.go）
##
## 流程：先由 scripts/prepare_openapi.py 把契约里的整型字段标记为 int64
## （32 位平台上 int 会溢出），再用 oapi-codegen 生成代码。
generate:
	python3 scripts/prepare_openapi.py $(CONTRACT) .gen/openapi.json
	oapi-codegen --config oapi-codegen.yaml .gen/openapi.json

## clean: 清理生成产物
clean:
	rm -rf dist .gen
