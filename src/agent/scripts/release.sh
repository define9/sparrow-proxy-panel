#!/usr/bin/env sh
#
# 生成发布产物与版本清单（latest.json），可选 ed25519 签名。
#
#   VERSION=0.2.0 BASE_URL=https://cdn.example.com/sparrow-agent \
#     KEY=release.key sh scripts/release.sh
#
# 产物：
#   dist/release/<version>/sparrow-agent-<os>-<arch>   交叉编译产物
#   dist/release/<version>/SHA256SUMS                  给 install.sh --sha256 用
#   dist/release/latest.json                           Agent 自更新清单（custom-url 源）
#
# 上传 GitHub Release：
#   gh release create agent/v0.2.0 dist/release/0.2.0/* --title "agent v0.2.0"
#   （把 latest.json 与 signature 另外放到自有源，或直接用 github 源）
set -eu

cd "$(dirname "$0")/.." # src/agent

VERSION=${VERSION:-$(git describe --tags --always --dirty 2>/dev/null | sed 's|^agent/||; s|^v||' || echo dev)}
CHANNEL=${CHANNEL:-stable}
BASE_URL=${BASE_URL:-https://example.com/sparrow-agent}
OUT_DIR=${OUT_DIR:-dist/release}
KEY=${KEY:-}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		openssl dgst -sha256 "$1" | awk '{print $NF}'
	fi
}

echo "==> 交叉编译（make cross）"
make cross

DEST="$OUT_DIR/$VERSION"
mkdir -p "$DEST"

ASSETS=$(mktemp)
SUMS=$(mktemp)
trap 'rm -f "$ASSETS" "$SUMS"' EXIT INT TERM HUP

# 平台键与 Makefile cross 的产物命名一一对应（见 internal/update.PlatformKey）。
PLATFORMS="linux-amd64 linux-arm64 linux-armv7 darwin-arm64 darwin-amd64 windows-amd64"
first=1
for platform in $PLATFORMS; do
	case "$platform" in
	windows-amd64) name="sparrow-agent-windows-amd64.exe" ;;
	*) name="sparrow-agent-$platform" ;;
	esac

	src="bin/$name"
	[ -f "$src" ] || {
		echo "缺少产物 $src（make cross 是否成功？）" >&2
		exit 1
	}

	cp "$src" "$DEST/$name"
	sum=$(sha256_of "$src")
	echo "$sum  ${name}" >>"$DEST/SHA256SUMS"

	if [ "$first" -eq 1 ]; then
		first=0
		printf '    "%s": "%s/%s/%s"' "$platform" "$BASE_URL" "$VERSION" "$name" >>"$ASSETS"
		printf '\n    "%s": "%s"' "$platform" "$sum" >>"$SUMS"
	else
		printf ',\n    "%s": "%s/%s/%s"' "$platform" "$BASE_URL" "$VERSION" "$name" >>"$ASSETS"
		printf ',\n    "%s": "%s"' "$platform" "$sum" >>"$SUMS"
	fi
	echo "  $platform  $sum"
done

cat >"$OUT_DIR/latest.json" <<EOF
{
  "version": "$VERSION",
  "channel": "$CHANNEL",
  "assets": {
$(cat "$ASSETS")
  },
  "sha256": {
$(cat "$SUMS")
  },
  "signature": ""
}
EOF

if [ -n "$KEY" ]; then
	echo "==> ed25519 签名"
	go run ./scripts/release-sign sign --key "$KEY" --manifest "$OUT_DIR/latest.json"
else
	echo "==> 未提供 KEY，latest.json 未签名（Agent 配置了 update.public_key 时会拒绝升级）"
fi

echo
echo "完成："
echo "  $OUT_DIR/latest.json"
echo "  $DEST/（$(ls "$DEST" | wc -l | tr -d ' ') 个文件）"
echo
echo "下一步："
echo "  gh release create agent/v$VERSION $DEST/* --title \"agent v$VERSION\""
echo "  # 或把 $DEST/ 与 $OUT_DIR/latest.json 同步到自有源（BASE_URL）"
