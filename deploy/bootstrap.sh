#!/usr/bin/env bash
# ============================================================
# Sparrow Panel —— 环境安装脚本（只装环境，不装应用）
#
# 装什么：Docker + compose 插件 + git。可选：swap、防火墙。
# 不装：Node / PostgreSQL / Caddy（都在容器里）。
#
# 远端执行（私有仓库，脚本从本机推过去，推荐）：
#   ssh root@<服务器> 'bash -s -- --swap' < deploy/bootstrap.sh
#
# 公开仓库也可以直接 curl：
#   curl -fsSL https://raw.githubusercontent.com/define9/sparrow-proxy-panel/main/deploy/bootstrap.sh \
#     | sudo bash -s -- --swap
#
# 参数：
#   --swap [大小]   可选：创建 swap（默认 2G），低内存机器构建时需要
#   --firewall      可选：启用 ufw 并只放行 22/80/443
#   --ipv6          可选：开启 Docker IPv6（原生 IPv6 公网机器必须）
#   --no-docker     跳过 Docker 安装（已装好时用）
# ============================================================
set -euo pipefail

SWAP_SIZE=""
FIREWALL=0
INSTALL_DOCKER=1
IPV6=0

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --swap)
      if [[ "${2:-}" =~ ^[0-9]+[GgMm]?$ ]]; then SWAP_SIZE="$2"; shift 2; else SWAP_SIZE="2G"; shift; fi ;;
    --firewall) FIREWALL=1; shift ;;
    --no-docker) INSTALL_DOCKER=0; shift ;;
    --ipv6) IPV6=1; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "需要 root：ssh root@<服务器> 或 sudo bash"
[[ -r /etc/os-release ]] || die "只支持 Debian/Ubuntu"

. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) die "当前系统 ${PRETTY_NAME:-unknown} 不受支持（脚本按 Debian/Ubuntu 写）" ;;
esac
log "系统：${PRETTY_NAME}"

# ---------- 1. swap（可选）----------
if [[ -n "$SWAP_SIZE" ]]; then
  if swapon --show | grep -q '/swapfile'; then
    log "swap 已存在，跳过"
  else
    log "创建 ${SWAP_SIZE} swap"
    fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log "swap 已启用：$(free -h | awk '/Swap/{print $2}')"
  fi
else
  MEM_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
  if [[ "$MEM_MB" -lt 1800 ]]; then
    warn "内存 ${MEM_MB}MB：构建镜像时可能 OOM，建议加参数 --swap（可选，不加强制）"
  fi
fi

# ---------- 2. 基础工具 ----------
log "安装基础工具（curl/gnupg/git）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git

# ---------- 3. Docker ----------
if [[ "$INSTALL_DOCKER" -eq 0 ]]; then
  log "跳过 Docker 安装（--no-docker）"
elif command -v docker >/dev/null 2>&1; then
  log "Docker 已安装：$(docker --version)"
else
  log "安装 Docker（官方源）"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker 安装完成：$(docker --version)"
fi

if [[ "$INSTALL_DOCKER" -eq 1 ]] || command -v docker >/dev/null 2>&1; then
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker info >/dev/null 2>&1 || die "Docker 守护进程未运行：systemctl status docker"
  docker compose version >/dev/null 2>&1 || die "缺少 compose 插件：apt install docker-compose-plugin"
  log "compose 插件：$(docker compose version --short 2>/dev/null || echo ok)"
fi

# ---------- 4. Docker IPv6（原生 IPv6 机器需要）----------
# 只有 IPv6 公网地址的机器，Docker 默认只发布 IPv4 端口 → 外部访问不到。
# 打开后容器的 ports 会同时监听 [::]，宿主 IPv6 直连即可。
# 不影响已有 IPv4 部署：daemon.json 里开启 ipv6 只是让 dockerd 自己有 IPv6 地址。
if [[ "$IPV6" -eq 1 ]]; then
  log "开启 Docker IPv6"
  install -d -m 0755 /etc/docker
  if [[ -f /etc/docker/daemon.json ]]; then
    # 已有配置：合并 ipv6 键，不覆盖别的设置
    cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
    python3 - <<'PY'
import json
p = '/etc/docker/daemon.json'
try:
    with open(p) as f:
        d = json.load(f)
except Exception:
    d = {}
d['ipv6'] = True
d.setdefault('experimental', True)
d.setdefault('fixed-cidr-v6', 'fd00:dead:beef::/48')
with open(p, 'w') as f:
    json.dump(d, f, indent=2)
print('  daemon.json:', json.dumps(d, ensure_ascii=False))
PY
  else
    cat >/etc/docker/daemon.json <<'EOF'
{
  "ipv6": true,
  "experimental": true,
  "fixed-cidr-v6": "fd00:dead:beef::/48"
}
EOF
    echo "  已写入 /etc/docker/daemon.json"
  fi
  systemctl restart docker
  sleep 3
  docker info >/dev/null 2>&1 || die "重启 Docker 后不可用：journalctl -u docker -n 50"
  log "Docker IPv6 已开启"
else
  warn "未开启 Docker IPv6（原生 IPv6 机器加 --ipv6；IPv4 机器不需要）"
fi

# ---------- 5. 防火墙（可选）----------
if [[ "$FIREWALL" -eq 1 ]]; then
  log "配置 ufw（只放行 22/80/443）"
  apt-get install -y -qq ufw
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ufw status | head -6
else
  warn "未启用防火墙（可选）：安全组/云防火墙请自行放行 22/80/443，其余端口不要开"
fi

echo
log "环境就绪。下一步（在服务器上）："
cat <<'EOF'
  git clone git@github.com:define9/sparrow-proxy-panel.git /opt/sparrow/app
  cd /opt/sparrow/app/deploy
  ./up.sh --domain panel.example.com

  已有代码只需更新：cd /opt/sparrow/app && git pull && ./deploy/up.sh
EOF
