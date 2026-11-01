#!/usr/bin/env bash
# Sparrow Panel 一键部署脚本
#
#   git clone git@github.com:define9/sparrow-proxy-panel.git && \
#     sudo ./sparrow-proxy-panel/deploy/install.sh --domain panel.example.com
#
# 只做三件事：装 Docker（若缺）→ 生成 .env → docker compose up。
# 反向代理（Caddy）跑在容器里，宿主机不需要额外装。
#
# 可选参数：
#   --domain <域名>     站点域名；内网/无域名用 :80（默认 :80）
#   --email <邮箱>      Let's Encrypt 通知邮箱（可选）
#   --repo <git 地址>   覆盖仓库地址（默认 git@github.com:define9/sparrow-proxy-panel.git）
#   --dir <目录>        安装目录（默认 /opt/sparrow）
#   --branch <分支>     拉取的分支（默认 main）
#   --swap [大小]       可选：创建 swap（默认 2G）。低内存机器构建时需要
#   --no-build          只改配置，不重新构建
#
set -euo pipefail

REPO="git@github.com:define9/sparrow-proxy-panel.git"
DIR="/opt/sparrow"
BRANCH="main"
DOMAIN=":80"
EMAIL=""
SWAP_SIZE=""
DO_BUILD=1

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --email)  EMAIL="${2:?}"; shift 2 ;;
    --repo)   REPO="${2:?}"; shift 2 ;;
    --dir)    DIR="${2:?}"; shift 2 ;;
    --branch) BRANCH="${2:?}"; shift 2 ;;
    --swap)
      if [[ "${2:-}" =~ ^[0-9]+[GgMm]?$ ]]; then SWAP_SIZE="$2"; shift 2; else SWAP_SIZE="2G"; shift; fi ;;
    --no-build) DO_BUILD=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

# ---------- 0. 前置检查 ----------
[[ $EUID -eq 0 ]] || die "请用 root 执行：sudo $0 $*"
command -v git >/dev/null || { log "安装 git"; apt-get update -qq && apt-get install -y -qq git; }

if [[ "$DOMAIN" != ":80" && "$DOMAIN" != http://* && "$DOMAIN" != https://* ]]; then
  :
fi
if [[ "$DOMAIN" != ":80" ]]; then
  log "站点域名: $DOMAIN"
else
  warn "未指定 --domain，将使用纯 HTTP(:80)。生产环境建议 --domain panel.example.com 自动签证书"
fi

# ---------- 1. 可选 swap ----------
if [[ -n "$SWAP_SIZE" ]]; then
  if swapon --show | grep -q '/swapfile'; then
    log "swap 已存在，跳过"
  else
    log "创建 ${SWAP_SIZE} swap"
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
else
  MEM_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
  if [[ "$MEM_MB" -lt 1800 ]]; then
    warn "内存 ${MEM_MB}MB，构建 Next.js 可能 OOM。建议加参数重跑：--swap"
  fi
fi

# ---------- 2. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "安装 Docker（官方源）"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker 安装完成: $(docker --version)"
else
  log "Docker 已安装: $(docker --version)"
fi

docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件（apt install docker-compose-plugin）"

# ---------- 3. 代码 ----------
if [[ -d "$DIR/app/.git" ]]; then
  log "更新代码: $DIR/app ($BRANCH)"
  git -C "$DIR/app" fetch --depth 1 origin "$BRANCH" && git -C "$DIR/app" reset --hard "origin/$BRANCH"
else
  log "克隆仓库到 $DIR/app"
  mkdir -p "$DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR/app"
fi

cd "$DIR/app/deploy"

# ---------- 4. 生成或复用 .env ----------
gen() { openssl rand -hex "$1"; }

if [[ -f .env ]]; then
  log ".env 已存在，保留原有密钥（不覆盖 MASTER_KEY）"
  set -a; . ./.env; set +a
  # 只补齐新版本需要的字段
  grep -q '^SITE_DOMAIN=' .env || echo "SITE_DOMAIN=$DOMAIN" >> .env
  grep -q '^ACME_EMAIL=' .env || echo "ACME_EMAIL=$EMAIL" >> .env
  [[ -n "$EMAIL" ]] && sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" .env
  [[ "$DOMAIN" != ":80" ]] && sed -i "s|^SITE_DOMAIN=.*|SITE_DOMAIN=$DOMAIN|" .env
  grep -q '^NEXT_PUBLIC_SITE_URL=' .env || echo "NEXT_PUBLIC_SITE_URL=http://localhost" >> .env
else
  log "生成 .env（随机密码与主密钥）"
  POSTGRES_PASSWORD=$(gen 16)
  MASTER_KEY=$(gen 32)
  SETUP_TOKEN=$(gen 16)
  if [[ "$DOMAIN" = ":80" ]]; then SITE_URL="http://$(hostname -I | awk '{print $1}'):80"; else SITE_URL="https://$DOMAIN"; fi

  cat > .env <<EOF
# 由 install.sh 生成于 $(date -Iseconds)。请备份 MASTER_KEY，丢失后节点密钥不可恢复。
POSTGRES_USER=sparrow
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=sparrow
TZ=Asia/Shanghai

MASTER_KEY=$MASTER_KEY
NEXT_PUBLIC_SITE_URL=$SITE_URL
SETUP_TOKEN=$SETUP_TOKEN

SITE_DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
EOF
  chmod 600 .env
fi

set -a; . ./.env; set +a
[[ "$DOMAIN" != ":80" ]] && sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://$DOMAIN|" .env && set -a && . ./.env

# ---------- 5. 启动 ----------
if [[ "$DO_BUILD" -eq 1 ]]; then
  log "构建并启动（首次 3-8 分钟）"
  docker compose up -d --build
else
  log "跳过构建，仅按当前配置启动"
  docker compose up -d
fi

log "等待面板健康检查…"
for i in $(seq 1 60); do
  if docker compose ps --format '{{.Service}} {{.Status}}' | grep -q 'panel .*healthy'; then
    log "面板已就绪"; break
  fi
  sleep 3
  [[ $i -eq 60 ]] && warn "等待超时，查看：docker compose logs -f panel"
done

echo
docker compose ps
echo
log "部署完成"
echo "  站点地址: ${NEXT_PUBLIC_SITE_URL}"
echo "  初始化页: ${NEXT_PUBLIC_SITE_URL}/setup"
echo "  初始化令牌: ${SETUP_TOKEN:-（.env 里未设置）}"
echo
echo "  查看日志: cd $DIR/app/deploy && docker compose logs -f panel"
echo "  升级:     cd $DIR/app && git pull && cd deploy && docker compose up -d --build"
echo "  备份:     docker exec sparrow-postgres pg_dump -U sparrow -Fc sparrow > sparrow-\$(date +%F).dump"
echo
warn "请立即备份 MASTER_KEY（deploy/.env 里的那一行），它不在数据库里"
