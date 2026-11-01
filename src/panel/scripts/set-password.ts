/**
 * 开发辅助：重设某个账号的密码。
 *
 *   node --env-file=.env --import tsx scripts/set-password.ts <email> <new-password>
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { hashPassword } from '../lib/auth/password'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('用法: set-password.ts <email> <new-password>')
    process.exit(2)
  }
  if (password.length < 8) {
    console.error('密码至少 8 位')
    process.exit(2)
  }

  const passwordHash = await hashPassword(password)
  const updated = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .returning({ id: users.id, email: users.email })

  if (updated.length === 0) {
    console.error(`账号不存在: ${email}`)
    process.exit(1)
  }

  console.log(`已重置密码: ${updated[0].email}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
