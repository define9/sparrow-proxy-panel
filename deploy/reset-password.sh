#!/usr/bin/env bash
# ============================================================
# 重置某个账号的密码（生产环境用，跑在容器里，宿主机不需要 Node）
#
#   ./reset-password.sh admin@example.com 'NewPass123'
#
# 说明：
#   - 密码只存 Argon2 哈希，无法找回，只能重置
#   - 不指定邮箱时，会列出所有管理员账号供选择
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

log()  { printf '\033[32m→\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then DOCKER=(sudo docker); fi
fi

"${DOCKER[@]}" compose ps >/dev/null 2>&1 || die "请在本仓库的 deploy/ 目录执行（需要 compose.yaml 与 .env）"

if [[ $# -lt 2 ]]; then
  log "当前账号列表："
  "${DOCKER[@]}" compose exec -T postgres psql -U "${POSTGRES_USER:-sparrow}" -d "${POSTGRES_DB:-sparrow}" \
    -c "select email, role_code, status, created_at::date from users order by role_code, email" 2>/dev/null \
    || die "查询失败，确认 postgres 容器在运行"
  echo
  echo "用法：./reset-password.sh <email> <新密码>"
  exit 2
fi

EMAIL="$1"
PASSWORD="$2"

log "重置 $EMAIL 的密码"
"${DOCKER[@]}" compose run --rm --no-deps --entrypoint node migrator \
  scripts/reset-password.mjs "$EMAIL" "$PASSWORD"
