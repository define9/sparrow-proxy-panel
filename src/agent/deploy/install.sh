#!/usr/bin/env sh
#
# Sparrow Agent 安装 / 升级脚本（Linux + systemd）。
#
#   ./install.sh --url https://panel.example.com --token <token>
#   ./install.sh --url https://panel.example.com --from-url https://cdn/latest/sparrow-agent-linux-amd64 --sha256 <64hex>
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
  --version <ver>      要安装的版本（默认 latest；面板源不可用时仅作记录）
  --from-url <url>     直接从该地址下载二进制，绕过面板下载接口
  --manifest <url>     release 清单地址（默认 <panel>/api/v1/public/agent/latest.json）
  --sha256 <hex>       二进制 sha256；不给则从 release 清单读取，都拿不到就中止
  --force              覆盖已存在的 /etc/sparrow-agent/config.yaml
  --no-register        安装后不调用 `sparrow-agent register`
  --no-start           安装 systemd 单元但不 start（只 enable）
  --dry-run            只打印将要执行的动作，不做任何修改
  -h, --help           显示本帮助

示例:
  # 面板已提供下载接口时
  curl -fsSL https://panel.example.com/install.sh | sudo sh -s -- --url https://panel.example.com --token abc

  # 面板接口还没实现（当前状态）：自带地址 + 校验值
  sudo ./install.sh --url https://panel.example.com --token abc \
    --from-url https://github.com/acme/sparrow/releases/download/agent/v0.2.0/sparrow-agent-linux-amd64 \
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

case "$OS" in
linux) ;;
*) [ "$DRY_RUN" -eq 1 ] || die "本脚本只支持 Linux（当前 ${OS}）；macOS 请直接 make build 后手动运行" ;;
esac
case "$ARCH" in
amd64 | arm64 | armv7) ;;
*) [ "$DRY_RUN" -eq 1 ] || die "不支持的架构 ${ARCH}（支持 amd64 / arm64 / armv7）；可用 --from-url 指定自编译产物" ;;
esac

# ---------------------------------------------------------------- URL / 校验值

DEFAULT_BINARY_URL="$PANEL_URL/api/v1/public/agent/download/$VERSION/$PLATFORM"
BINARY_URL=${FROM_URL:-$DEFAULT_BINARY_URL}
[ -n "$MANIFEST_URL" ] || MANIFEST_URL="$PANEL_URL/api/v1/public/agent/latest.json"

if [ "$DRY_RUN" -eq 1 ]; then
	cat <<EOF
[dry-run] 将执行以下动作（不落地）：
  平台:        $PLATFORM
  二进制来源:  $BINARY_URL
  清单来源:    $MANIFEST_URL
  sha256:      ${SHA256:-<从清单读取>}
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

# manifest_sha FILE PLATFORM → 打印 64 位 hex，找不到返回 1
manifest_sha() {
	_block=$(sed -n '/"sha256"[[:space:]]*:/,/}/p' "$1" 2>/dev/null || true)
	[ -n "$_block" ] || return 1
	_hex=$(printf '%s\n' "$_block" | grep -F "\"$2\"" | sed -n 's/.*"\([0-9a-fA-F]\{64\}\)".*/\1/p' | head -n 1)
	[ -n "$_hex" ] || return 1
	printf '%s\n' "$_hex"
}

# manifest_asset URL PLATFORM → 打印该平台的下载地址，找不到返回 1
manifest_asset() {
	_block=$(sed -n '/"assets"[[:space:]]*:/,/}/p' "$1" 2>/dev/null || true)
	[ -n "$_block" ] || return 1
	_url=$(printf '%s\n' "$_block" | grep -F "\"$2\"" | sed -n 's/.*"\(https*:\/\/[^"]*\)".*/\1/p' | head -n 1)
	[ -n "$_url" ] || return 1
	printf '%s\n' "$_url"
}

MANIFEST_FILE="$TMP_DIR/latest.json"
HAVE_MANIFEST=0
if download "$MANIFEST_URL" "$MANIFEST_FILE" 2>/dev/null; then
	HAVE_MANIFEST=1
	info "已获取 release 清单: $MANIFEST_URL"
else
	warn "无法获取 release 清单: $MANIFEST_URL"
fi

if [ "$HAVE_MANIFEST" -eq 1 ]; then
	if [ "$VERSION" = "latest" ]; then
		_manifest_version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST_FILE" | head -n 1)
		[ -n "$_manifest_version" ] && VERSION=$_manifest_version
	fi
	if [ -z "$FROM_URL" ] && [ "$BINARY_URL" = "$DEFAULT_BINARY_URL" ]; then
		_manifest_url=$(manifest_asset "$MANIFEST_FILE" "$PLATFORM" || true)
		[ -n "$_manifest_url" ] && BINARY_URL=$_manifest_url
	fi
	if [ -z "$SHA256" ]; then
		SHA256=$(manifest_sha "$MANIFEST_FILE" "$PLATFORM" || true)
		[ -n "$SHA256" ] && info "从清单取到 $PLATFORM 的 sha256"
	fi
fi

if [ -z "$SHA256" ]; then
	if [ "$BINARY_URL" = "$DEFAULT_BINARY_URL" ]; then
		cat >&2 <<EOF
[错误] 无法校验二进制，安装中止。

面板还没有提供下载/清单接口（/api/v1/public/agent/download/* 与
/api/v1/public/agent/latest.json 均未实现，见 docs/architecture/agent-cli.md §9/§12），
本脚本拒绝在无法校验 sha256 的情况下安装二进制。

请改用下面任一方式：
  1) 显式给出地址与校验值：
     sudo $0 --url $PANEL_URL --token <token> \\
       --from-url https://<你的源>/sparrow-agent-$PLATFORM \\
       --sha256 <64 位 hex>

  2) 先发布一份 release 清单（deploy/release.example.json 格式），再：
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
