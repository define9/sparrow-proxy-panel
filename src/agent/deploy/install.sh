#!/usr/bin/env sh
#
# Sparrow Agent 安装 / 升级脚本（Linux + systemd）。
#
#   ./install.sh --url https://panel.example.com --token <token>
#   ./install.sh --url https://panel.example.com --from-url https://cdn/latest/sparrow-agent-linux-amd64 --sha256 <64hex>
#
# 二进制不再由面板托管：清单默认取 $PANEL_URL/api/v1/public/agent/release，
# 里面的地址指向 GitHub Release（或自建 CDN），sha256 也必须由清单给出。
#
# 幂等：重复执行不会报错；升级时会先停服务、备份旧二进制（.bak）再替换。
# 只做这几件事：装二进制、写配置（0600）、建数据目录、装 systemd 单元、enabl+start。
# 详细说明见 src/agent/README.md「发布与安装」。
set -eu

BIN_NAME="sparrow-agent"
# 路径可用环境变量覆盖，便于在 CI/容器里做彩排（生产环境保持默认即可）。
BIN_DIR="${SPARROW_BIN_DIR:-/usr/local/bin}"
CONF_DIR="${SPARROW_CONF_DIR:-/etc/sparrow-agent}"
CONF_FILE="$CONF_DIR/config.yaml"
DATA_DIR="${SPARROW_DATA_DIR:-/var/lib/sparrow-agent}"
LOG_FILE="${SPARROW_LOG_FILE:-/var/log/sparrow-agent.log}"
UNIT_FILE="${SPARROW_UNIT_FILE:-/etc/systemd/system/sparrow-agent.service}"
SERVICE="sparrow-agent"

PANEL_URL=""
TOKEN=""
VERSION="latest"
SHA256=""
FROM_URL=""
MANIFEST_URL=""
FORCE=0
DRY_RUN=0
START_SERVICE=1
DO_REGISTER=1

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || echo "")

# ---------------------------------------------------------------- 输出

info() { printf '\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[警告]\033[0m %s\n' "$*" >&2; }
die() {
	printf '\033[31m[错误]\033[0m %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Sparrow Agent 安装脚本

用法:
  install.sh --url <panel> --token <token> [选项]
  install.sh --url <panel> --from-url <二进制地址> --sha256 <64位hex> [选项]

必填:
  --url <panel>        面板地址，例如 https://panel.example.com
  --token <token>      面板「节点管理」生成的一次性注册令牌（--no-register 时可不填）

选项:
  --version <ver>      要安装的版本（默认取清单里的 version）
  --from-url <url>     直接从该地址下载二进制，绕过清单
  --manifest <url>     显式指定清单（本地路径 / file:// / http(s) 均可）
                       默认依次尝试 <panel>/api/v1/public/agent/release
                       与旧路径 <panel>/agent/latest.json
                       （清单格式见 docs/architecture/agent-cli.md §9）
  --sha256 <hex>       二进制 sha256；不给则从 release 清单读取，都拿不到就中止
  --force              覆盖已存在的 /etc/sparrow-agent/config.yaml
  --no-register        安装后不调用 `sparrow-agent register`
  --no-start           安装 systemd 单元但不 start（只 enable）
  --dry-run            只打印将要执行的动作，不做任何修改
  -h, --help           显示本帮助

环境变量（彩排用，生产保持默认）:
  SPARROW_PLATFORM     覆盖平台探测结果，如 linux-amd64
  SPARROW_BIN_DIR / SPARROW_CONF_DIR / SPARROW_DATA_DIR ...
                       覆盖安装路径，便于在容器里试运行

示例:
  # 面板已配置 Agent 发布源（默认取 /api/v1/public/agent/release）
  curl -fsSL https://panel.example.com/agent/install.sh | sudo sh -s -- \
    --url https://panel.example.com --token abc

  # 清单在别处（例如自建 CDN 的 latest.json）
  sudo ./install.sh --url https://panel.example.com --token abc \
    --manifest https://cdn.example.com/sparrow-agent/latest.json

  # 面板还没配置发布源：自带地址 + 校验值
  sudo ./install.sh --url https://panel.example.com --token abc \
    --from-url https://github.com/acme/sparrow/releases/download/agent%2Fv0.2.0/sparrow-agent-linux-amd64 \
    --sha256 9f8c...e1
EOF
}

# ---------------------------------------------------------------- 参数

need_value() {
	# $1 = 选项名，$2 = 剩余参数个数
	[ "$2" -ge 2 ] || die "$1 需要一个值"
}

while [ $# -gt 0 ]; do
	case "$1" in
	--url)
		need_value "$1" $#
		PANEL_URL=$2
		shift 2
		;;
	--token)
		need_value "$1" $#
		TOKEN=$2
		shift 2
		;;
	--version)
		need_value "$1" $#
		VERSION=$2
		shift 2
		;;
	--sha256)
		need_value "$1" $#
		SHA256=$2
		shift 2
		;;
	--from-url)
		need_value "$1" $#
		FROM_URL=$2
		shift 2
		;;
	--manifest)
		need_value "$1" $#
		MANIFEST_URL=$2
		shift 2
		;;
	--force)
		FORCE=1
		shift
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	--no-register)
		DO_REGISTER=0
		shift
		;;
	--no-start)
		START_SERVICE=0
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		usage >&2
		die "未知参数: $1"
		;;
	esac
done

[ -n "$PANEL_URL" ] || {
	usage >&2
	die "缺少 --url"
}
PANEL_URL=${PANEL_URL%/}

if [ "$DO_REGISTER" -eq 1 ] && [ -z "$TOKEN" ] && [ "$DRY_RUN" -ne 1 ]; then
	usage >&2
	die "缺少 --token（或加 --no-register 跳过注册）"
fi

# ---------------------------------------------------------------- 环境探测

detect_platform() {
	uname_s=$(uname -s 2>/dev/null || echo unknown)
	case "$uname_s" in
	Linux) OS=linux ;;
	Darwin) OS=darwin ;;
	*) OS=$(printf '%s' "$uname_s" | tr '[:upper:]' '[:lower:]') ;;
	esac

	machine=$(uname -m 2>/dev/null || echo unknown)
	case "$machine" in
	x86_64 | amd64) ARCH=amd64 ;;
	aarch64 | arm64) ARCH=arm64 ;;
	armv7l | armv7 | armhf) ARCH=armv7 ;;
	armv6l) ARCH=armv6 ;;
	*) ARCH=$machine ;;
	esac
	PLATFORM="$OS-$ARCH"
}

detect_platform

# 彩排/CI 可显式指定平台键（如 SPARROW_PLATFORM=linux-amd64），生产不需要
if [ -n "${SPARROW_PLATFORM:-}" ]; then
	PLATFORM=$SPARROW_PLATFORM
	OS=${PLATFORM%%-*}
	ARCH=${PLATFORM#*-}
fi

case "$OS" in
linux) ;;
*) [ "$DRY_RUN" -eq 1 ] || die "本脚本只支持 Linux（当前 ${OS}）；macOS 请直接 make build 后手动运行" ;;
esac
case "$ARCH" in
amd64 | arm64 | armv7) ;;
*) [ "$DRY_RUN" -eq 1 ] || die "不支持的架构 ${ARCH}（支持 amd64 / arm64 / armv7）；可用 --from-url 指定自编译产物" ;;
esac

# ---------------------------------------------------------------- 临时目录 / 抓取

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM HUP

fetch() { # fetch URL → stdout
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --connect-timeout 15 --max-time 60 "$1"
	else
		wget -q -O - --timeout=60 "$1"
	fi
}

download() { # download URL FILE
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --connect-timeout 15 --max-time 600 -o "$2" "$1"
	else
		wget -q -O "$2" --timeout=600 "$1"
	fi
}

# fetch_file SRC DEST：本地路径 / file:// 直接拷贝，其余走 curl/wget
fetch_file() {
	case "$1" in
	file://*)
		_src=${1#file://}
		[ -f "$_src" ] || return 1
		cp "$_src" "$2"
		;;
	/* | ./* | ../*)
		[ -f "$1" ] || return 1
		cp "$1" "$2"
		;;
	*)
		download "$1" "$2"
		;;
	esac
}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	elif command -v openssl >/dev/null 2>&1; then
		openssl dgst -sha256 "$1" | awk '{print $NF}'
	else
		die "找不到 sha256 工具（sha256sum / shasum / openssl）"
	fi
}

# ---------------------------------------------------------------- 清单解析
#
# 两种格式（见 docs/architecture/agent-cli.md §9）：
#   新（面板 /api/v1/public/agent/release）：
#     { "assets": { "linux-amd64": { "url": "...", "sha256": "<64hex>" } } }
#   旧（/agent/latest.json）：
#     { "assets": { "linux-amd64": "<url>" }, "sha256": { "linux-amd64": "<64hex>" } }
#
# 节点上不一定有 jq，这里用 awk 做一个只够用的 JSON 读取器：
# compact 压成单行，然后按「平衡花括号 + 第一层键」取值。

# compact FILE → 单行 JSON（去掉换行/制表，压缩冒号两侧空白）
compact() {
	tr -d '\n\r\t' <"$1" | sed 's/[[:space:]]*:[[:space:]]*/:/g'
}

# json_member OBJECT KEY → 打印该键的原样值（{...} / [...] / "..."），找不到返回 1
json_member() {
	printf '%s' "$1" | awk -v want="$2" '
	{
		s = $0; n = length(s); depth = 0
		for (i = 1; i <= n; i++) {
			c = substr(s, i, 1)
			if (c == "{") { depth++; continue }
			if (c == "}") { depth--; continue }
			if (c != "\"" || depth != 1) continue
			j = i + 1
			while (j <= n && substr(s, j, 1) != "\"") j++
			name = substr(s, i + 1, j - i - 1)
			k = j + 1
			if (substr(s, k, 1) != ":") { i = j; continue }
			k++
			if (name == want) {
				if (substr(s, k, 1) == "{") {
					d = 0
					for (m = k; m <= n; m++) {
						cc = substr(s, m, 1)
						if (cc == "{") d++
						else if (cc == "}") { d--; if (d == 0) { print substr(s, k, m - k + 1); exit 0 } }
					}
					exit 1
				}
				if (substr(s, k, 1) == "[") {
					d = 0
					for (m = k; m <= n; m++) {
						cc = substr(s, m, 1)
						if (cc == "[") d++
						else if (cc == "]") { d--; if (d == 0) { print substr(s, k, m - k + 1); exit 0 } }
					}
					exit 1
				}
				if (substr(s, k, 1) == "\"") {
					m = k + 1
					while (m <= n && substr(s, m, 1) != "\"") m++
					print substr(s, k, m - k + 1)
					exit 0
				}
				exit 1
			}
			i = j
		}
		exit 1
	}'
}

# json_keys OBJECT → 第一层键名，每行一个
json_keys() {
	printf '%s' "$1" | awk '
	{
		s = $0; n = length(s); depth = 0
		for (i = 1; i <= n; i++) {
			c = substr(s, i, 1)
			if (c == "{") { depth++; continue }
			if (c == "}") { depth--; continue }
			if (c != "\"" || depth != 1) continue
			j = i + 1
			while (j <= n && substr(s, j, 1) != "\"") j++
			name = substr(s, i + 1, j - i - 1)
			k = j + 1
			if (substr(s, k, 1) == ":") print name
			i = j
		}
	}'
}

# json_string OBJECT KEY → 去掉引号的字符串值，不是字符串则返回 1
json_string() {
	_v=$(json_member "$1" "$2") || return 1
	case "$_v" in
	\"*\") printf '%s' "$_v" | sed 's/^"//; s/"$//' ;;
	*) return 1 ;;
	esac
}

# manifest_version FILE → 清单里的 version（没有则返回 1）
manifest_version() {
	json_string "$(compact "$1")" version
}

# manifest_platforms FILE → assets 里的平台键，每行一个
manifest_platforms() {
	_text=$(compact "$1")
	_assets=$(json_member "$_text" assets) || return 1
	json_keys "$_assets"
}

# manifest_for_platform FILE PLATFORM → 打印 "url sha256"（字段可能为空），没有该平台返回 1
manifest_for_platform() {
	_text=$(compact "$1")
	_assets=$(json_member "$_text" assets) || return 1
	_member=$(json_member "$_assets" "$2") || return 1
	case "$_member" in
	\"*\")
		# 旧格式：assets[platform] = "url"，sha256 在独立的 sha256 对象里
		_url=$(printf '%s' "$_member" | sed 's/^"//; s/"$//')
		_sha=""
		if _su=$(json_member "$_text" sha256); then
			_sha=$(json_string "$_su" "$2") || _sha=""
		fi
		;;
	\{*\})
		# 新格式：assets[platform] = { url, sha256 }
		_url=$(json_string "$_member" url) || _url=""
		_sha=$(json_string "$_member" sha256) || _sha=""
		;;
	*) return 1 ;;
	esac
	printf '%s %s\n' "$_url" "$_sha"
}

# join_url BASE URL：相对地址（以 / 开头）拼到面板地址上
join_url() {
	case "$2" in
	/*) printf '%s%s\n' "${1%/}" "$2" ;;
	*) printf '%s\n' "$2" ;;
	esac
}

# ---------------------------------------------------------------- URL / 校验值

DEFAULT_BINARY_URL="$PANEL_URL/api/v1/public/agent/download/$VERSION/$PLATFORM"
BINARY_URL=${FROM_URL:-$DEFAULT_BINARY_URL}
MANIFEST_SOURCE=""
SHA_FROM_MANIFEST=0
_available=""

if [ -n "$MANIFEST_URL" ]; then
	MANIFEST_SOURCES=$MANIFEST_URL
	MANIFEST_EXPLICIT=1
else
	# 新接口优先；旧路径兜底（面板未配置发布源时新接口返回 assets: {}）
	MANIFEST_SOURCES="$PANEL_URL/api/v1/public/agent/release $PANEL_URL/agent/latest.json"
	MANIFEST_EXPLICIT=0
fi

_resolved=""
for _src in $MANIFEST_SOURCES; do
	_file="$TMP_DIR/manifest.json"
	if ! fetch_file "$_src" "$_file" 2>/dev/null; then
		[ "$MANIFEST_EXPLICIT" -eq 1 ] && die "无法获取 release 清单: $_src"
		warn "无法获取 release 清单: $_src"
		continue
	fi

	_platforms=$(manifest_platforms "$_file" || true)
	if [ -z "$_platforms" ]; then
		[ "$MANIFEST_EXPLICIT" -eq 1 ] && die "清单 $_src 里没有 assets（面板可能尚未配置 Agent 发布源）"
		warn "清单 $_src 没有 assets，尝试下一个来源"
		continue
	fi

	if ! _pair=$(manifest_for_platform "$_file" "$PLATFORM"); then
		_available=$_platforms
		if [ "$MANIFEST_EXPLICIT" -eq 1 ]; then
			die "清单 $_src 里没有当前平台 $PLATFORM
可用平台：$(printf '%s' "$_platforms" | tr '\n' ' ')"
		fi
		warn "清单 $_src 没有当前平台 ${PLATFORM}，尝试下一个来源"
		continue
	fi

	_resolved=$_pair
	MANIFEST_SOURCE=$_src
	info "已获取 release 清单: $_src"
	break
done

if [ -n "$_resolved" ]; then
	_murl=${_resolved% *}
	_msha=${_resolved#* }

	if [ "$VERSION" = "latest" ]; then
		_mver=$(manifest_version "$TMP_DIR/manifest.json" || true)
		[ -n "$_mver" ] && VERSION=$_mver
	fi

	if [ -z "$FROM_URL" ] && [ -n "$_murl" ]; then
		BINARY_URL=$(join_url "$PANEL_URL" "$_murl")
	fi

	if [ -z "$SHA256" ] && [ -n "$_msha" ]; then
		SHA256=$_msha
		SHA_FROM_MANIFEST=1
		info "从清单取到 $PLATFORM 的 sha256"
	fi
elif [ -n "$_available" ]; then
	die "当前平台 $PLATFORM 不在发布清单里
可用平台：$(printf '%s' "$_available" | tr '\n' ' ')
可用 --from-url + --sha256 指定自编译产物"
fi

if [ "$DRY_RUN" -eq 1 ]; then
	cat <<EOF
[dry-run] 将执行以下动作（不落地）：
  平台:        $PLATFORM
  二进制来源:  $BINARY_URL
  清单来源:    ${MANIFEST_SOURCE:-<无可用清单>}
  sha256:      ${SHA256:-<从清单读取>}$([ "$SHA_FROM_MANIFEST" -eq 1 ] && echo "（来自清单）")
  安装到:      $BIN_DIR/$BIN_NAME
  配置:        ${CONF_FILE}（已存在时保留，除非 --force）
  数据目录:    $DATA_DIR
  日志:        $LOG_FILE
  systemd:     ${UNIT_FILE}（enable=${START_SERVICE}）
  注册:        $([ "$DO_REGISTER" -eq 1 ] && echo yes || echo no)
EOF
	exit 0
fi

[ "$(id -u 2>/dev/null || echo 1)" -eq 0 ] || die "需要 root 权限：sudo $0 ..."

command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 ||
	die "需要 curl 或 wget"

if [ -z "$SHA256" ]; then
	if [ "$BINARY_URL" = "$DEFAULT_BINARY_URL" ]; then
		cat >&2 <<EOF
[错误] 无法校验二进制，安装中止。

面板没有提供可用的 Agent 发布清单（/api/v1/public/agent/release 与
/agent/latest.json 都没取到 $PLATFORM 的地址与 sha256），
本脚本拒绝在无法校验 sha256 的情况下安装二进制。

请改用下面任一方式：
  1) 显式给出地址与校验值：
     sudo $0 --url $PANEL_URL --token <token> \\
       --from-url https://<你的源>/sparrow-agent-$PLATFORM \\
       --sha256 <64 位 hex>

  2) 显式指定 release 清单（install.sh 支持的面板版 / latest.json 版都行）：
     sudo $0 --url $PANEL_URL --token <token> \\
       --manifest https://<你的源>/latest.json

  3) 用本仓库产物手动安装：
     cd src/agent && make cross
     shasum -a 256 bin/sparrow-agent-$PLATFORM
     sudo $0 --url $PANEL_URL --token <token> \\
       --from-url file://$PWD/bin/sparrow-agent-$PLATFORM --sha256 <上一步输出>
EOF
		exit 1
	fi
	die "缺少 --sha256（或提供可访问的 --manifest）：拒绝安装未校验的二进制"
fi

case "$SHA256" in
*[!0-9a-fA-F]*) die "--sha256 不是合法的 16 进制字符串: $SHA256" ;;
esac
[ ${#SHA256} -eq 64 ] || die "--sha256 长度应为 64（当前 ${#SHA256}）"
SHA256=$(printf '%s' "$SHA256" | tr '[:upper:]' '[:lower:]')

# ---------------------------------------------------------------- 下载并校验

info "下载 $BIN_NAME $VERSION ($PLATFORM)"
info "  ← $BINARY_URL"

NEW_BIN="$TMP_DIR/$BIN_NAME"
case "$BINARY_URL" in
file://*)
	SRC=${BINARY_URL#file://}
	[ -f "$SRC" ] || die "本地文件不存在: $SRC"
	cp "$SRC" "$NEW_BIN"
	;;
*)
	download "$BINARY_URL" "$NEW_BIN" || {
		cat >&2 <<EOF
[错误] 下载失败: $BINARY_URL

如果这是面板默认地址，说明面板下载接口 /api/v1/public/agent/download/* 尚未实现。
请用 --from-url + --sha256 指定可下载的二进制（见 --help 示例）。
EOF
		exit 1
	}
	;;
esac

[ -s "$NEW_BIN" ] || die "下载到的文件为空: $BINARY_URL"

ACTUAL=$(sha256_of "$NEW_BIN")
if [ "$ACTUAL" != "$SHA256" ]; then
	die "sha256 校验失败，已中止（未改动任何文件）
  期望: $SHA256
  实际: $ACTUAL"
fi
info "sha256 校验通过: $ACTUAL"

# ---------------------------------------------------------------- 停服务 + 备份 + 替换

BIN="$BIN_DIR/$BIN_NAME"

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
	info "停止现有服务 $SERVICE"
	systemctl stop "$SERVICE"
fi

mkdir -p "$BIN_DIR" "$CONF_DIR" "$DATA_DIR"
if [ -f "$BIN" ]; then
	cp -p "$BIN" "$BIN.bak"
	info "已备份旧二进制 → $BIN.bak"
fi

install -m 0755 "$NEW_BIN" "$BIN"
info "已安装 $BIN"

# ---------------------------------------------------------------- 配置文件

render_config() {
	if [ -f "$CONF_FILE" ] && [ "$FORCE" -ne 1 ]; then
		warn "已存在 ${CONF_FILE}，保留原配置（重置请加 --force）"
		chmod 0600 "$CONF_FILE" 2>/dev/null || true
		return 0
	fi

	_old_umask=$(umask)
	umask 077
	if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/config.example.yaml" ]; then
		sed "s|^  url: .*|  url: \"$PANEL_URL\"|" "$SCRIPT_DIR/config.example.yaml" >"$CONF_FILE"
	else
		cat >"$CONF_FILE" <<EOF
# Sparrow Agent 配置（由 install.sh 生成）
# 节点凭据由 \`sparrow-agent register\` 写入，文件权限必须保持 0600。

panel:
  url: "$PANEL_URL"
  node_id: ""
  node_secret: ""

core:
  type: "sing-box"
  binary: "/usr/local/bin/sing-box"
  config_path: "/etc/sparrow-agent/core.json"
  version_constraint: ">=1.12.0 <2.0.0"

agent:
  data_dir: "$DATA_DIR"
  heartbeat_interval: 30s
  config_poll_interval: 300s
  command_poll_timeout: 25s
  max_backoff: 5m
  log_level: "info"
  log_file: "$LOG_FILE"

tls:
  ca_file: ""
  insecure: false
  server_name: ""

update:
  enabled: true
  channel: "stable"
  source: "panel"
  custom_url: ""
  public_key: ""
EOF
	fi
	umask "$_old_umask"
	chmod 0600 "$CONF_FILE"
	info "已写入配置 ${CONF_FILE}（0600）"
}

render_config

# systemd 的 ReadWritePaths 需要日志文件存在（unit 里用 `-` 前缀，不存在也能启动）
touch "$LOG_FILE" 2>/dev/null || warn "无法创建 $LOG_FILE"
chmod 0640 "$LOG_FILE" 2>/dev/null || true

# ---------------------------------------------------------------- systemd

install_unit() {
	if [ ! -d /run/systemd/system ]; then
		warn "未检测到运行中的 systemd（容器或非 systemd 环境），跳过服务安装"
		warn "可前台运行: $BIN run -c $CONF_FILE"
		return 0
	fi

	mkdir -p "$(dirname "$UNIT_FILE")"
	if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/sparrow-agent.service" ]; then
		install -m 0644 "$SCRIPT_DIR/sparrow-agent.service" "$UNIT_FILE"
	else
		cat >"$UNIT_FILE" <<'EOF'
[Unit]
Description=Sparrow Proxy Agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/local/bin/sparrow-agent run -c /etc/sparrow-agent/config.yaml
Restart=always
RestartSec=5
TimeoutStopSec=30
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/sparrow-agent /etc/sparrow-agent -/var/log/sparrow-agent.log

[Install]
WantedBy=multi-user.target
EOF
	fi
	info "已安装 systemd 单元 $UNIT_FILE"

	systemctl daemon-reload
	systemctl enable "$SERVICE" >/dev/null 2>&1 || warn "systemctl enable 失败，请手动检查"
	if [ "$START_SERVICE" -eq 1 ]; then
		if systemctl restart "$SERVICE"; then
			info "服务已启动: systemctl status $SERVICE"
		else
			warn "服务启动失败，查看日志: journalctl -u $SERVICE -n 100 --no-pager"
		fi
	else
		info "已 enable 但未启动（--no-start）"
	fi
}

install_unit

# ---------------------------------------------------------------- 注册（尽力而为）

if [ "$DO_REGISTER" -eq 1 ] && [ -n "$TOKEN" ]; then
	info "注册节点到 $PANEL_URL"
	if "$BIN" register --url "$PANEL_URL" --token "$TOKEN" -c "$CONF_FILE"; then
		info "注册成功，凭据已写入 $CONF_FILE"
		if [ -d /run/systemd/system ] && [ "$START_SERVICE" -eq 1 ]; then
			systemctl restart "$SERVICE" >/dev/null 2>&1 || warn "重启服务失败，请手动 systemctl restart $SERVICE"
		fi
	else
		warn "注册失败（令牌可能已使用或面板不可达）。稍后手动执行：
  $BIN register --url $PANEL_URL --token <新令牌> -c $CONF_FILE"
	fi
fi

# ---------------------------------------------------------------- 收尾

if VERSION_OUT=$("$BIN" --version 2>/dev/null); then
	info "已安装: $VERSION_OUT"
else
	warn "$BIN --version 执行失败，请检查二进制与架构（${PLATFORM}）"
fi

info "完成。常用命令："
cat <<EOF
  systemctl status $SERVICE
  journalctl -u $SERVICE -f                 # systemd 日志
  tail -f $LOG_FILE                         # 文件日志（若配置了 log_file）
  $BIN doctor -c $CONF_FILE                 # 自检
  $BIN update --check -c $CONF_FILE         # 检查新版本
EOF
