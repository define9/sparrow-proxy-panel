#!/usr/bin/env bash
# 本地数据库快捷操作（包装 docker compose）
#
#   ./scripts/db.sh up        启动数据库
#   ./scripts/db.sh down      停止（保留数据）
#   ./scripts/db.sh reset     停止并删除数据卷（会清空数据）
#   ./scripts/db.sh status    状态
#   ./scripts/db.sh logs      跟随日志
#   ./scripts/db.sh psql      连到 sparrow 库
#   ./scripts/db.sh create <name>   新建一个库（给其他服务用）
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/compose/docker-compose.dev.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
CONTAINER="sparrow-postgres"
DB_USER="sparrow"
DB_NAME="sparrow"

case "${1:-up}" in
  up)
    "${COMPOSE[@]}" up -d db
    echo "✓ 数据库已启动（127.0.0.1:5432）"
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  reset)
    "${COMPOSE[@]}" down -v
    echo "✓ 数据卷已删除（下次 up 会重新初始化）"
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    "${COMPOSE[@]}" logs -f db
    ;;
  psql)
    shift
    docker exec -it "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
    ;;
  create)
    name="${2:?用法：$0 create <库名>}"
    docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0"
    echo "✔ 已创建数据库 ${name}"
    ;;
  list)
    docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -tAc \
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
    ;;
  *)
    echo "用法：$0 {up|down|reset|status|logs|psql|create <name>|list}"
    exit 1
    ;;
esac
