#!/usr/bin/env sh
#
# 交叉编译 + 生成发布产物 + 上传 GitHub Release（可选 ed25519 签名）。
#
#   VERSION=0.1.0 TAG=agent/v0.1.0 PANEL_URL=https://panel.example.com \
#     sh scripts/release.sh --upload
#
# 产物：
#   dist/release/<version>/sparrow-agent-<os>-<arch>   交叉编译产物
#   dist/release/<version>/SHA256SUMS                  校验值清单
#   dist/release/latest.json                           Agent 自更新清单（格式不变）
#   dist/release/panel-release.json                    面板发布元信息（二进制不经过面板）
#
# 两种分发形态：
#   - Agent 自更新 / 自建源：latest.json + 二进制（同目录，BASE_URL 可覆盖地址前缀）
#   - 面板 s 节点安装：面板只提供 install.sh + /api/v1/public/agent/release 元信息，
#     二进制由节点直接从 GitHub Release 下载
#
# 环境变量：
#   VERSION       版本号（默认 git describe；不带 v 前缀）
#   CHANNEL       发布通道（默认 stable）
#   TAG           Release tag（默认 agent/v$VERSION）
#   GITHUB_REPO   owner/repo（默认 define9/sparrow-proxy-panel）
#   BASE_URL      自定义源地址前缀（默认 GitHub Release 下载地址）
#   SOURCE        github / custom-url（默认 github）
#   KEY           ed25519 私钥文件；给了就签名 latest.json
#
# 没有 gh（或未登录）时只产出本地文件并提示，不会失败——
# 上传是维护者动作，CI 里也可以只跑产物那一段。
set -eu

cd "$(dirname "$0")/.." # src/agent

usage() {
	cat <<'EOF'
用法: sh scripts/release.sh [--upload]

  --upload   产物就绪后调用 gh release create/upload 上传到 GitHub Release
             （需要 gh 且已 gh auth login；缺失时只产出本地文件）

环境变量: VERSION CHANNEL TAG GITHUB_REPO BASE_URL SOURCE KEY
详见脚本头部注释。
EOF
}

UPLOAD=0
for arg in "$@"; do
	case "$arg" in
	--upload) UPLOAD=1 ;;
	--no-upload) UPLOAD=0 ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "未知参数: ${arg}（见 --help）" >&2
		exit 2
		;;
	esac
done

VERSION=${VERSION:-$(git describe --tags --always --dirty 2>/dev/null | sed 's|^agent/||; s|^v||' || echo dev)}
CHANNEL=${CHANNEL:-stable}
OUT_DIR=${OUT_DIR:-dist/release}
KEY=${KEY:-}
REPO=${GITHUB_REPO:-define9/sparrow-proxy-panel}
TAG=${TAG:-agent/v$VERSION}
SOURCE=${SOURCE:-github}

if [ -n "${PANEL_URL:-}" ]; then
	PANEL_URL=${PANEL_URL%/}
fi

# GitHub Release 的下载地址里 tag 需要转义（agent/v0.1.0 → agent%2Fv0.1.0）
TAG_PATH=$(printf '%s' "$TAG" | sed 's|/|%2F|g')
if [ "$SOURCE" = "github" ]; then
	[ -n "$REPO" ] || {
		echo "SOURCE=github 需要 GITHUB_REPO（owner/repo）" >&2
		exit 1
	}
	BASE_URL=${BASE_URL:-https://github.com/$REPO/releases/download/$TAG_PATH}
else
	BASE_URL=${BASE_URL:?SOURCE=$SOURCE 需要 BASE_URL（自定义源地址前缀）}
fi

echo "==> 版本 ${VERSION}（tag ${TAG}，通道 ${CHANNEL}，source ${SOURCE}）"
echo "==> 交叉编译（make cross）"
make cross

DEST="$OUT_DIR/$VERSION"
mkdir -p "$DEST"
rm -f "$DEST/SHA256SUMS"

ASSETS=$(mktemp)
SUMS=$(mktemp)
PANEL_ASSETS=$(mktemp)
trap 'rm -f "$ASSETS" "$SUMS" "$PANEL_ASSETS"' EXIT INT TERM HUP

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		openssl dgst -sha256 "$1" | awk '{print $NF}'
	fi
}

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
		echo "缺少产物 ${src}（make cross 是否成功？）" >&2
		exit 1
	}

	cp "$src" "$DEST/$name"
	sum=$(sha256_of "$src")
	# sha256 必须来自实际产物文件，不能手写
	printf '%s  %s\n' "$sum" "$name" >>"$DEST/SHA256SUMS"

	url="$BASE_URL/$name"
	if [ "$first" -eq 1 ]; then
		first=0
		printf '    "%s": "%s"' "$platform" "$url" >>"$ASSETS"
		printf '\n    "%s": "%s"' "$platform" "$sum" >>"$SUMS"
		printf '\n    "%s": { "url": "%s", "sha256": "%s" }' "$platform" "$url" "$sum" >>"$PANEL_ASSETS"
	else
		printf ',\n    "%s": "%s"' "$platform" "$url" >>"$ASSETS"
		printf ',\n    "%s": "%s"' "$platform" "$sum" >>"$SUMS"
		printf ',\n    "%s": { "url": "%s", "sha256": "%s" }' "$platform" "$url" "$sum" >>"$PANEL_ASSETS"
	fi
	echo "  $platform  $sum"
done

# Agent 自更新 / 自建源用的清单（格式保持不变，internal/update 直接解析）
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

SIGNATURE=""
if [ -n "$KEY" ]; then
	echo "==> ed25519 签名"
	go run ./scripts/release-sign sign --key "$KEY" --manifest "$OUT_DIR/latest.json"
	SIGNATURE=$(sed -n 's/.*"signature"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$OUT_DIR/latest.json" | tail -n 1)
else
	echo "==> 未提供 KEY，latest.json 未签名（Agent 配置了 update.public_key 时会拒绝升级）"
fi

# 面板用的发布元信息：只有 URL + sha256，二进制不经过面板
cat >"$OUT_DIR/panel-release.json" <<EOF
{
  "version": "$VERSION",
  "channel": "$CHANNEL",
  "source": "$SOURCE",
  "repo": "$REPO",
  "tag": "$TAG",
  "assets": {$(cat "$PANEL_ASSETS")
  },
  "installScript": "/agent/install.sh",
  "signature": "$SIGNATURE"
}
EOF

echo
echo "产物："
echo "  $OUT_DIR/latest.json（Agent 自更新）"
echo "  $OUT_DIR/panel-release.json（面板发布元信息）"
echo "  $DEST/（$(ls "$DEST" | wc -l | tr -d ' ') 个文件）"

UPLOADED=0
if [ "$UPLOAD" -eq 1 ]; then
	echo
	echo "==> 上传 GitHub Release $TAG"
	if ! command -v gh >/dev/null 2>&1; then
		echo "  [提示] 没装 gh（https://cli.github.com），只产出本地文件，未上传"
	elif ! gh auth status >/dev/null 2>&1; then
		echo "  [提示] gh 未登录（gh auth login），只产出本地文件，未上传"
	else
		if gh release view "$TAG" >/dev/null 2>&1; then
			echo "  Release $TAG 已存在，覆盖上传资产（--clobber）"
			# shellcheck disable=SC2086
			gh release upload "$TAG" "$DEST"/* "$OUT_DIR/latest.json" --clobber
		else
			# shellcheck disable=SC2086
			gh release create "$TAG" "$DEST"/* "$OUT_DIR/latest.json" --title "Agent $VERSION" \
				--notes "Sparrow Agent $VERSION

- 通道: $CHANNEL
- 平台: $PLATFORMS
- 校验值: 见 SHA256SUMS（面板 /api/v1/public/agent/release 与 install.sh 使用同一份 sha256）"
		fi
		UPLOADED=1
		echo "  已上传：https://github.com/$REPO/releases/tag/$TAG"
	fi
fi

echo
echo "下一步："
if [ "$UPLOADED" -eq 1 ]; then
	echo "  把发布元信息写进面板（幂等）："
	ROOT=$(cd ../.. && pwd)
	echo "    cd $ROOT && node src/panel/scripts/publish-agent-release.mjs $OUT_DIR/panel-release.json"
	if [ -n "${PANEL_URL:-}" ]; then
		echo "  校验面板接口："
		echo "    curl -s $PANEL_URL/api/v1/public/agent/release"
	fi
else
	echo "  手动上传（或装 gh 后加 --upload 重跑）："
	echo "    gh release create $TAG $DEST/* $OUT_DIR/latest.json --title \"Agent $VERSION\""
	echo "  然后写进面板："
	ROOT=$(cd ../.. && pwd)
	echo "    cd $ROOT && node src/panel/scripts/publish-agent-release.mjs $OUT_DIR/panel-release.json"
fi
