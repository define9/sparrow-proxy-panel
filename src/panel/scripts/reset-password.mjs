/**
 * 生产环境重置密码（不依赖 tsx / drizzle，只用 pg + argon2）。
 *
 *   docker compose run --rm --entrypoint node migrator scripts/reset-password.mjs <email> <new-password>
 *   # 或使用封装脚本：./reset-password.sh <email> <new-password>
 */
import { hash } from '@node-rs/argon2'
import pg from 'pg'

const [email, password] = process.argv.slice(2)

if (!email || !password) {
  console.error('用法: reset-password.mjs <email> <new-password>')
  process.exit(2)
}
if (password.length < 8) {
  console.error('密码至少 8 位')
  process.exit(2)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('缺少 DATABASE_URL')
  process.exit(1)
}

const passwordHash = await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 })
const client = new pg.Client({ connectionString: url })

try {
  await client.connect()
  const result = await client.query(
    'update users set password_hash = $1, updated_at = now() where lower(email) = lower($2) returning id, email, role_code',
    [passwordHash, email]
  )

  if (result.rowCount === 0) {
    console.error(`账号不存在: ${email}`)
    process.exit(1)
  }

  const row = result.rows[0]
  console.log(`✓ 已重置密码: ${row.email}（角色 ${row.role_code}）`)
  console.log('  会话未失效，如需强制下线可执行：')
  console.log(`  docker compose exec -T postgres psql -U sparrow -d sparrow -c "delete from sessions where user_id='${row.id}'"`)
} catch (error) {
  console.error('重置失败:', error.message)
  process.exit(1)
} finally {
  await client.end()
}
