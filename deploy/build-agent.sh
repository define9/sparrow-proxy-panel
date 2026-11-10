#!/usr/bin/env bash
# ============================================================
# 【已废弃】正常用 GitHub Release 分发，二进制不进面板：
#   src/agent/scripts/release.sh --upload  →  gh release create
#   （面板 /api/v1/public/agent/release 直接代理 GitHub，没有「写面板」这一步）
# 本脚本只保留给「完全离线 / 自建 CDN」的场景：产出 agent-dist/ 后自行托管，
# 节点安装时用 --manifest <你的源>/agent/latest.json。
#
# 构建节点 Agent 二进制，并生成可分发的目录 agent-dist/
#
#   ./build-agent.sh [版本号]
#
# 产物：
#   agent-dist/sparrow-agent-linux-amd64
#   agent-dist/sparrow-agent-linux-arm64
#   agent-dist/sparrow-agent-linux-armv7
#   agent-dist/latest.json          ← 版本 + 下载地址 + sha256（安装脚本据此校验）
#   agent-dist/install.sh           ← 节点上直接 curl 执行的安装脚本
#
# 宿主机只需要 Docker（用 golang 镜像交叉编译，不装 Go）。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
OUT="$PWD/agent-dist"
SRC="$ROOT/src/agent"
GO_IMAGE="${GO_IMAGE:-golang:1.24-alpine}"

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# 版本号：显式参数 > git describe > 0.0.0-dev
VERSION="${1:-$(git -C "$ROOT" describe --tags --abbrev=0 2>/dev/null || echo v0.1.0)}"

# 面板对外地址（manifest 里的下载链接要用绝对地址）
SITE_URL="${NEXT_PUBLIC_SITE_URL:-$(grep -E '^NEXT_PUBLIC_SITE_URL=' .env 2>/dev/null | cut -d= -f2- || true)}"
[[ -n "$SITE_URL" ]] || die "拿不到面板地址：在 deploy/.env 设置 NEXT_PUBLIC_SITE_URL，或显式传环境变量"

command -v docker >/dev/null || die "需要 docker"
docker info >/dev/null 2>&1 || die "Docker 未运行（sudo systemctl start docker）"

mkdir -p "$OUT"
log "版本 ${VERSION}，下载地址前缀 ${SITE_URL}/agent"

for arch in amd64 arm64 arm; do
  case "$arch" in
    amd64) goarch=amd64; goarm="" ;;
    arm64) goarch=arm64; goarm="" ;;
    arm)   goarch=arm;   goarm=7  ;;
  esac
  target="sparrow-agent-linux-$([[ $arch = arm ]] && echo armv7 || echo $arch)"
  log "编译 $target"
  docker run --rm \
    -v "$SRC:/src" -w /src \
    -e CGO_ENABLED=0 -e GOOS=linux -e GOARCH="$goarch" ${goarm:+-e GOARM=$goarm} \
    "$GO_IMAGE" \
    go build -trimpath -ldflags "-s -w" -o "bin/_build-$arch" ./cmd/sparrow-agent >/dev/null
  mv "$SRC/bin/_build-$arch" "$OUT/$target"
  chmod +x "$OUT/$target"
done

# 安装脚本也放进分发目录，节点上可直接 curl
cp "$SRC/deploy/install.sh" "$OUT/install.sh"
chmod +x "$OUT/install.sh"

log "生成 latest.json"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }

cat > "$OUT/latest.json" <<EOF
{
  "version": "$VERSION",
  "channel": "stable",
  "assets": {
    "linux-amd64": "$SITE_URL/agent/sparrow-agent-linux-amd64",
    "linux-arm64": "$SITE_URL/agent/sparrow-agent-linux-arm64",
    "linux-armv7": "$SITE_URL/agent/sparrow-agent-linux-armv7"
  },
  "sha256": {
    "linux-amd64": "$(sha "$OUT/sparrow-agent-linux-amd64")",
    "linux-arm64": "$(sha "$OUT/sparrow-agent-linux-arm64")",
    "linux-armv7": "$(sha "$OUT/sparrow-agent-linux-armv7")"
  }
}
EOF

ls -lh "$OUT" | sed 's/^/  /'
echo
log "完成。二进制不进面板：把 agent-dist/ 放到你自己的静态源（自建 CDN）"
echo "  节点安装时显式指定清单：--manifest <你的源>/agent/latest.json"
echo "  常规流程请改用 src/agent/scripts/release.sh --upload（GitHub Release，面板自动代理）。"
echo
log "节点上一条命令安装（把 <token> 换成面板里的一次性注册令牌）："
cat <<EOF
  curl -fsSL $SITE_URL/agent/install.sh | sudo sh -s -- \\
    --url $SITE_URL --token <token> \\
    --manifest $SITE_URL/agent/latest.json
EOF
