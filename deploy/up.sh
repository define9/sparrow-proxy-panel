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
#   ./up.sh --no-build                       # 不重建镜像，只重启
#   ./up.sh --down                           # 停止
# ============================================================
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

DOMAIN=""
EMAIL=""
DO_BUILD=1
ACTION="up"

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --email)  EMAIL="${2:?}"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --down) ACTION="down"; shift ;;
    -h|--help) sed -n '2,18p' "$SELF"; exit 0 ;;
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

if [[ "$ACTION" = "down" ]]; then
  log "停止服务（数据保留在 volume 里）"
  "${DOCKER[@]}" compose down
  exit 0
fi

# ---------- 1. .env ----------
gen() { openssl rand -hex "$1"; }

if [[ -f .env ]]; then
  log ".env 已存在（保留现有密钥，不覆盖 MASTER_KEY）"
  set -a; . ./.env; set +a

  if [[ -n "$DOMAIN" ]]; then
    grep -q '^SITE_DOMAIN=' .env && sed -i "s|^SITE_DOMAIN=.*|SITE_DOMAIN=$DOMAIN|" .env || echo "SITE_DOMAIN=$DOMAIN" >> .env
    SITE_DOMAIN="$DOMAIN"
  fi
  if [[ -n "$EMAIL" ]]; then
    grep -q '^ACME_EMAIL=' .env && sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" .env || echo "ACME_EMAIL=$EMAIL" >> .env
  fi
  grep -q '^SETUP_TOKEN=' .env || echo "SETUP_TOKEN=$(gen 16)" >> .env
  set -a; . ./.env; set +a
else
  [[ -n "$DOMAIN" ]] || { DOMAIN=":80"; warn "未指定 --domain，使用纯 HTTP(:80)"; }

  if [[ "$DOMAIN" = ":80" ]]; then
    SITE_URL="http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
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
NEXT_PUBLIC_SITE_URL=$SITE_URL
SETUP_TOKEN=$(gen 16)

SITE_DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
EOF
  chmod 600 .env
  set -a; . ./.env; set +a
fi

# 域名与站点地址保持同步
if [[ -n "${SITE_DOMAIN:-}" && "$SITE_DOMAIN" != ":80" && "$SITE_DOMAIN" != http* ]]; then
  WANT_URL="https://$SITE_DOMAIN"
  if [[ "${NEXT_PUBLIC_SITE_URL:-}" != "$WANT_URL" ]]; then
    sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=$WANT_URL|" .env
    set -a; . ./.env; set +a
    log "同步 NEXT_PUBLIC_SITE_URL=$WANT_URL"
  fi
fi

# ---------- 2. compose ----------
if [[ "$DO_BUILD" -eq 1 ]]; then
  log "构建并启动（首次 3-8 分钟）"
  "${DOCKER[@]}" compose up -d --build
else
  log "跳过构建，直接启动"
  "${DOCKER[@]}" compose up -d
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
