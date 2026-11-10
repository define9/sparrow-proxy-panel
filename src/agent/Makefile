BINARY := sparrow-agent
PKG := ./cmd/sparrow-agent
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w

.PHONY: build test vet fmt lint run clean cross test-install

build:
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY) $(PKG)

test:
	go test ./...

# 安装脚本的清单解析测试（shell）
test-install:
	sh deploy/install_test.sh

vet:
	go vet ./...

fmt:
	gofmt -l -w .

lint: vet
	@test -z "$$(gofmt -l .)" || (echo "有文件未格式化，运行 make fmt"; exit 1)
	@sh deploy/install_test.sh >/dev/null && echo "install.sh 测试通过" 

run: build
	./bin/$(BINARY) run -c deploy/config.example.yaml

clean:
	rm -rf bin

# 交叉编译（面板下载页/发布流水线用）
cross:
	CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-linux-amd64      $(PKG)
	CGO_ENABLED=0 GOOS=linux   GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-linux-arm64      $(PKG)
	CGO_ENABLED=0 GOOS=linux   GOARCH=arm   go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-linux-armv7      $(PKG)
	CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-darwin-arm64     $(PKG)
	CGO_ENABLED=0 GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-darwin-amd64     $(PKG)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY)-windows-amd64.exe $(PKG)
