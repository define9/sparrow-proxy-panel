#!/usr/bin/env bash
# 本地开发用 PostgreSQL 管理脚本
#
#   ./scripts/pg.sh start    启动（不存在则初始化）
#   ./scripts/pg.sh stop     停止
#   ./scripts/pg.sh status   查看状态
#   ./scripts/pg.sh reset    删库重建（会清空所有数据）
#   ./scripts/pg.sh psql     连到 sparrow 库
#
# 数据目录默认在 ~/Library/Application Support/sparrow-pg（不会随临时目录被清理）
set -euo pipefail

PG_VERSION="${PG_VERSION:-17.11}"
PG_BIN="${PG_BIN:-$HOME/.local/share/mise/installs/postgres/$PG_VERSION/bin}"
PG_DATA="${PG_DATA:-$HOME/Library/Application Support/sparrow-pg}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-sparrow}"
PG_DB="${PG_DB:-sparrow}"

if [ ! -x "$PG_BIN/initdb" ]; then
  echo "找不到 PostgreSQL 可执行文件：$PG_BIN/initdb"
  echo "安装方式：mise install postgres@$PG_VERSION"
  exit 1
fi

is_running() {
  "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1
}

init_db() {
  if [ -d "$PG_DATA/base" ]; then
    return
  fi
  echo "→ 初始化数据目录 $PG_DATA"
  mkdir -p "$(dirname "$PG_DATA")"
  rm -rf "$PG_DATA"
  "$PG_BIN/initdb" -D "$PG_DATA" -U "$PG_USER" --auth=trust -E UTF8 >"$PG_DATA.initdb.log" 2>&1
  # 允许连接串里的明文口令（本机开发用）
  {
    echo "host all all 127.0.0.1/32 trust"
    echo "host all all ::1/128 trust"
  } >> "$PG_DATA/pg_hba.conf"
}

start() {
  if is_running; then
    echo "✓ 已在运行（端口 ${PG_PORT}）"
    return
  fi
  init_db
  echo "→ 启动 PostgreSQL（端口 ${PG_PORT}，数据目录 ${PG_DATA}）"
  "$PG_BIN/pg_ctl" -D "$PG_DATA" \
    -o "-p ${PG_PORT} -k '${PG_DATA}' -c listen_addresses=127.0.0.1" \
    -l "${PG_DATA}/server.log" start
  sleep 1
  # 业务库
  if ! "$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$PG_DB"; then
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$PG_DB"
    echo "✓ 已创建数据库 $PG_DB"
  fi
  echo "✓ PostgreSQL 就绪：postgresql://$PG_USER@127.0.0.1:$PG_PORT/$PG_DB"
}

stop() {
  if is_running; then
    "$PG_BIN/pg_ctl" -D "$PG_DATA" stop -m fast
    echo "✓ 已停止"
  else
    echo "· 未在运行"
  fi
}

status() {
  if is_running; then
    echo "✓ 运行中（端口 ${PG_PORT}）"
    "$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c \
      "select count(*) as tables from information_schema.tables where table_schema='public';"
  else
    echo "✗ 未运行（数据目录 ${PG_DATA}）"
  fi
}

reset() {
  stop || true
  rm -rf "$PG_DATA" "$PG_DATA.initdb.log"
  echo "✓ 已清空，下次 start 会重新初始化"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  reset) reset ;;
  psql) shift; "$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" "$@" ;;
  *) echo "用法：$0 {start|stop|restart|status|reset|psql}"; exit 1 ;;
esac
