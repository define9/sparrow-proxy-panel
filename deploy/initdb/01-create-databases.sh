#!/usr/bin/env bash
# 初始化脚本：docker-entrypoint-initdb.d 只在数据目录为空时执行一次
#
# 用途：为「其他服务」预留独立数据库，避免每接一个服务就新建一个容器。
# 新增服务时，往下加一段 createdb 即可。

set -euo pipefail

create_db() {
  local db="$1"
  local owner="${POSTGRES_USER:-sparrow}"

  if psql -v ON_ERROR_STOP=1 --username "$owner" --dbname postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    echo "→ 数据库 ${db} 已存在，跳过"
  else
    psql -v ON_ERROR_STOP=1 --username "$owner" --dbname postgres \
      -c "CREATE DATABASE ${db} ENCODING 'UTF8' TEMPLATE template0"
    echo "✔ 已创建数据库 ${db}"
  fi
}

# ── Sparrow 面板主库 ──
create_db sparrow

# ── 预留：其他服务按需启用 ──
# create_db sparrow_agent     # 节点服务独立库（如将来拆分）
# create_db sparrow_analytics # 分析/报表库
# create_db sparrow_notify   # 通知服务库

echo "✔ 全部数据库初始化完成"
