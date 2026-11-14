#!/usr/bin/env bash
# ============================================================
# Sparrow Panel —— 本地启动脚本（只负责 docker compose）
#
# 前置：已装 Docker（见 bootstrap.sh），当前目录是仓库的 deploy/。
# 作用：没有 .env 就生成（随机密钥）→ docker compose up -d --build → 等健康检查。
# 若当前用户不在 docker 组，会自动改用 sudo 执行。
#
# 用法：
#   ./up.sh                                  # 默认纯 HTTP(:80)，无域名时用
#   ./up.sh --domain panel.example.com       # 有域名：自动申请证书
#   ./up.sh --domain panel.example.com --email me@example.com
#   ./up.sh --no-caddy                       # 只跑 DB + 面板（端口 127.0.0.1:3000），反代用机器上已有的
#   ./up.sh --pull                           # 先 git pull 再构建
#   ./up.sh --no-build                       # 不重建镜像，只重启
#   ./up.sh --down                           # 停止
#
# IPv6 / 直连（无反代）：
#   ./up.sh --no-caddy --site-url 'http://[240e::1]:8080' --bind '' --port 8080
#   （--bind '' = 监听所有接口；IPv6 字面量必须带方括号）
# ============================================================
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

DOMAIN=""
EMAIL=""
SITE_URL_OVERRIDE=""
BIND=""
BIND_SET=0
PORT=""
DO_BUILD=1
DO_PULL=0
EDGE=1          # 1 = 内置 caddy（compose profile: edge）；0 = 只跑数据库 + 面板
ACTION="up"

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# 猜本机对外地址（无域名时用）。
# IPv6 必须带方括号：http://[240e::1]:80 —— 直接拼 "http://240e::1" 是非法 URL。
detect_local_origin() {
  # 优先 IPv4（兼容性最好）
  local v4
  v4=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([^ ]*\).*/\1/p' | head -1)
  if [[ -n "$v4" ]]; then
    printf 'http://%s' "$v4"
    return 0
  fi
  # 退到网卡地址（取第一个全局 IPv6，排除链路本地 fe80::）
  local v6
  v6=$(ip -6 addr show scope global 2>/dev/null | sed -n 's/.*inet6 \([0-9a-fA-F:]*\).*/\1/p' | head -1)
  if [[ -n "$v6" ]]; then
    printf 'http://[%s]' "$v6"
    return 0
  fi
  printf 'http://localhost'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --email)  EMAIL="${2:?}"; shift 2 ;;
    --site-url) SITE_URL_OVERRIDE="${2:?}"; shift 2 ;;
    # --bind 允许空值（'' = 监听所有接口），所以不能用 ${2:?}
    --bind)   BIND="${2-}"; BIND_SET=1; shift 2 ;;
    --port)   PORT="${2:?}"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --pull) DO_PULL=1; shift ;;
    --no-caddy) EDGE=0; shift ;;
    --down) ACTION="down"; shift ;;
    -h|--help) sed -n '2,20p' "$SELF"; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

# ---------- 0. Docker 可用性 ----------
command -v docker >/dev/null 2>&1 || die "没装 Docker：先执行 deploy/bootstrap.sh（或 apt install docker-ce docker-compose-plugin）"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  # 区分「没权限」和「守护进程没跑」
  ERR="$(docker info 2>&1 || true)"
  if grep -qi 'permission denied' <<<"$ERR"; then
    if sudo docker info >/dev/null 2>&1; then
      DOCKER=(sudo docker)
      warn "当前用户不在 docker 组，本次用 sudo 执行"
      warn "长期方案：sudo usermod -aG docker \$USER && newgrp docker"
    else
      die "没有权限访问 Docker，且 sudo 也失败。请先确认：sudo systemctl enable --now docker"
    fi
  elif grep -qi 'cannot connect\|is the docker daemon running\|connection refused' <<<"$ERR"; then
    die "Docker 守护进程未运行。执行：sudo systemctl enable --now docker（排查看 sudo journalctl -u docker -n 50）"
  else
    if sudo docker info >/dev/null 2>&1; then
      DOCKER=(sudo docker)
      warn "docker info 失败，改用 sudo 执行"
    else
      die "Docker 不可用：$ERR"
    fi
  fi
fi

"${DOCKER[@]}" compose version >/dev/null 2>&1 || die "缺少 compose 插件：sudo apt install docker-compose-plugin"

COMPOSE_ARGS=()
[[ "$EDGE" -eq 1 ]] && COMPOSE_ARGS+=(--profile edge)

if [[ "$ACTION" = "down" ]]; then
  log "停止服务（数据保留在 volume 里）"
  "${DOCKER[@]}" compose ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} down
  exit 0
fi

# ---------- 0.5 代码是否最新 ----------
GIT=(git -C .. -c safe.directory=*)
if "${GIT[@]}" rev-parse --git-dir >/dev/null 2>&1; then
  UPSTREAM="$("${GIT[@]}" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [[ -n "$UPSTREAM" ]]; then
    if [[ "$DO_PULL" -eq 1 ]]; then
      log "拉取最新代码（$UPSTREAM）"
      "${GIT[@]}" pull --ff-only || warn "git pull 失败，继续用当前代码"
    else
      BEHIND="$("${GIT[@]}" rev-list --count "HEAD..$UPSTREAM" 2>/dev/null || echo 0)"
      if [[ "${BEHIND:-0}" -gt 0 ]]; then
        warn "本地代码落后 $UPSTREAM $BEHIND 个提交；加 --pull 自动更新"
      fi
    fi
  fi
fi

# ---------- 1. .env ----------
gen() { openssl rand -hex "$1"; }

# 覆盖 .env 里的某个键（存在就改，不存在就追加），改完重新加载。
# 用 awk 整行替换而不是 sed：值里可能有 IPv6 的方括号（http://[240e::1]:8080）、
# 特殊字符、& 等，sed 逐个转义太脆弱。
set_env() {
  local key="$1" value="$2"
  awk -v k="$key" -v v="$value" '
    BEGIN { FS = OFS = "=" }
    $1 == k { print k "=" v; found = 1; next }
    { print }
    END { if (!found) print k "=" v }
  ' .env > .env.tmp && mv .env.tmp .env
  set -a; . ./.env; set +a
}

if [[ -f .env ]]; then
  log ".env 已存在（保留现有密钥，不覆盖 MASTER_KEY）"
  set -a; . ./.env; set +a

  if [[ -n "$DOMAIN" ]]; then
    set_env SITE_DOMAIN "$DOMAIN"
    SITE_DOMAIN="$DOMAIN"
  fi
  if [[ -n "$EMAIL" ]]; then
    set_env ACME_EMAIL "$EMAIL"
  fi
  grep -q '^SETUP_TOKEN=' .env || echo "SETUP_TOKEN=$(gen 16)" >> .env
  set -a; . ./.env; set +a
else
  [[ -n "$DOMAIN" ]] || { DOMAIN=":80"; warn "未指定 --domain，使用纯 HTTP(:80)"; }

  if [[ -n "$SITE_URL_OVERRIDE" ]]; then
    SITE_URL="$SITE_URL_OVERRIDE"
  elif [[ "$DOMAIN" = ":80" ]]; then
    # 无域名：猜本机对外地址。IPv6 必须带方括号，否则 URL 非法。
    SITE_URL="http://$(detect_local_origin)"
  else
    SITE_URL="https://${DOMAIN#http*://}"
  fi

  log "生成 .env（随机数据库密码与 MASTER_KEY）"
  cat > .env <<EOF
# 由 up.sh 生成于 $(date -Iseconds)
# 警告：MASTER_KEY 丢失后，数据库中加密的节点密钥将无法恢复——请备份本文件
POSTGRES_USER=sparrow
POSTGRES_PASSWORD=$(gen 16)
POSTGRES_DB=sparrow
TZ=Asia/Shanghai

MASTER_KEY=$(gen 32)
# 站点对外地址。SITE_URL 是运行时读取（改了立即生效），
# NEXT_PUBLIC_SITE_URL 会被构建期内联进前端 bundle，仅作兼容保留。
SITE_URL=$SITE_URL
NEXT_PUBLIC_SITE_URL=$SITE_URL
SETUP_TOKEN=$(gen 16)

SITE_DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL

# panel 监听：PANEL_BIND 留空 = 所有接口（IPv4+IPv6 直连）；默认只绑回环给反代用
PANEL_BIND=$BIND
PANEL_PORT=${PORT:-3000}
EOF
  chmod 600 .env
  set -a; . ./.env; set +a
fi

# 应用本次传入的覆盖项
[[ -n "$SITE_URL_OVERRIDE" ]] && {
  set_env SITE_URL "$SITE_URL_OVERRIDE"
  set_env NEXT_PUBLIC_SITE_URL "$SITE_URL_OVERRIDE"
}
[[ -n "$PORT" ]] && set_env PANEL_PORT "$PORT"
# BIND 可能是空字符串（= 监听所有接口），所以用「参数是否传了」判断而不是值是否为空
[[ "$BIND_SET" -eq 1 ]] && set_env PANEL_BIND "$BIND"

# 域名与站点地址保持同步（改域名时一并更新两个变量）
if [[ -n "${SITE_DOMAIN:-}" && "$SITE_DOMAIN" != ":80" && "$SITE_DOMAIN" != http* ]]; then
  WANT_URL="https://$SITE_DOMAIN"
  if [[ "${SITE_URL:-}" != "$WANT_URL" ]]; then
    set_env SITE_URL "$WANT_URL"
    set_env NEXT_PUBLIC_SITE_URL "$WANT_URL"
    log "同步站点地址为 $WANT_URL"
  fi
fi

# ---------- 2. compose ----------
if [[ "$DO_BUILD" -eq 1 ]]; then
  log "构建并启动（首次 3-8 分钟）"
  "${DOCKER[@]}" compose ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} up -d --build
else
  log "跳过构建，直接启动"
  "${DOCKER[@]}" compose ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} up -d
fi

# ---------- 3. 等健康 ----------
log "等待 panel 就绪…"
for i in $(seq 1 80); do
  STATUS="$("${DOCKER[@]}" compose ps --format '{{.Service}} {{.Status}}' 2>/dev/null || true)"
  if grep -qE '^panel .*healthy' <<<"$STATUS"; then
    log "panel 已就绪"
    break
  fi
  if grep -qE '^panel .*Exited' <<<"$STATUS"; then
    warn "panel 启动失败，最近日志："
    "${DOCKER[@]}" compose logs --tail 40 panel
    exit 1
  fi
  sleep 3
  if [[ $i -eq 80 ]]; then
    warn "等待超时，手动检查：${DOCKER[*]} compose logs -f panel"
  fi
done

# ---------- 4. caddy 自检（仅内置 caddy 模式） ----------
sleep 3
if [[ "$EDGE" -eq 1 ]]; then
CADDY_STATUS="$("${DOCKER[@]}" compose ps --format '{{.Service}} {{.Status}}' 2>/dev/null | grep '^caddy ' || true)"
if grep -qiE 'restarting|exited' <<<"$CADDY_STATUS"; then
  warn "caddy 异常：$CADDY_STATUS"
  echo "  最近日志："
  "${DOCKER[@]}" compose logs --tail 20 caddy 2>&1 | sed 's/^/    /'
  cat <<'TIP'

  常见原因：
    1) 80/443 被占用（旧 nginx/caddy/systemd 服务）：sudo ss -lntp | grep -E ':(80|443)'
    2) 配置解析失败：按下面命令看真实报错
       sudo docker compose run --rm --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    3) .env 里 SITE_DOMAIN 为空或格式不对（应为 panel.example.com 或 :80）
TIP
fi
fi

echo
"${DOCKER[@]}" compose ps
echo
log "完成"
printf '  站点：%s\n' "${NEXT_PUBLIC_SITE_URL:-http://localhost}"
printf '  初始化：%s/setup\n' "${NEXT_PUBLIC_SITE_URL:-http://localhost}"
printf '  初始化令牌：%s\n' "${SETUP_TOKEN:-（未设置）}"
echo
echo "  日志： ${DOCKER[*]} compose logs -f panel"
echo "  重启： ${DOCKER[*]} compose restart panel"
echo "  停止： ./up.sh --down"
echo "  升级： cd .. && git pull && ./deploy/up.sh"
if [[ "$EDGE" -eq 0 ]]; then
  echo
  echo "  外部反代（机器上统一的 Caddy）指向：127.0.0.1:${PANEL_PORT:-3000}"
  echo "    https://你的域名 { reverse_proxy 127.0.0.1:${PANEL_PORT:-3000} }"
fi
