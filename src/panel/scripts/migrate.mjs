/**
 * 生产环境迁移：只依赖 drizzle-orm + pg（构建镜像里已装）。
 *
 *   node scripts/migrate.mjs
 *
 * 失败以非 0 退出，容器编排会因此中止，不会带着旧表结构启动应用。
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] 缺少 DATABASE_URL')
  process.exit(1)
}

const db = drizzle(url)

try {
  console.log('[migrate] 应用迁移…')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[migrate] 完成')
  process.exit(0)
} catch (error) {
  console.error('[migrate] 失败:', error)
  process.exit(1)
}
