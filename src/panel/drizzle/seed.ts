/**
 * 初始化数据：角色、权限、管理员账号、示例商品。
 *
 *   pnpm db:seed
 *
 * 环境变量：
 *   DATABASE_URL      必填
 *   ADMIN_EMAIL       默认 admin@sparrow.local
 *   ADMIN_PASSWORD    默认 admin12345（生产务必修改）
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { PERMISSION_LIST } from '../../../packages/contracts/src/permissions'
import { scryptHash } from '../server/utils/password'
import * as schema from './schema'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('✖ 缺少 DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl })
const db = drizzle(pool, { schema })

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@sparrow.local').toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345'

async function seedRoles() {
  const builtins = [
    { code: 'user', name: '普通用户', isSystem: true, description: '已注册用户' },
    { code: 'admin', name: '管理员', isSystem: true, description: '运营人员' },
    { code: 'superadmin', name: '超级管理员', isSystem: true, description: '拥有全部权限' }
  ]

  for (const role of builtins) {
    const existing = await db.select().from(schema.roles).where(eq(schema.roles.code, role.code)).limit(1)
    if (existing.length === 0) {
      await db.insert(schema.roles).values(role)
      console.log(`✔ 角色 ${role.code}`)
    }
  }
}

async function seedPermissions() {
  for (const code of PERMISSION_LIST) {
    const existing = await db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.code, code))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(schema.permissions).values({
        code,
        name: code,
        groupName: code.split(':')[1] ?? 'other'
      })
    }
  }
  console.log(`✔ 权限点 ${PERMISSION_LIST.length} 个`)
}

async function seedRolePermissions() {
  const all = await db.select().from(schema.permissions)
  const permissionByCode = new Map(all.map(p => [p.code, p.id]))

  for (const roleCode of ['user', 'admin', 'superadmin']) {
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.code, roleCode)).limit(1)
    if (!role) {
      continue
    }

    const existing = await db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, role.id))

    if (existing.length > 0) {
      continue
    }

    const codes = roleCode === 'superadmin'
      ? PERMISSION_LIST
      : roleCode === 'admin'
        ? PERMISSION_LIST.filter(code => code.endsWith(':read'))
        : []

    const rows = codes
      .map(code => permissionByCode.get(code))
      .filter((id): id is string => Boolean(id))
      .map(permissionId => ({ roleId: role.id, permissionId }))

    if (rows.length > 0) {
      await db.insert(schema.rolePermissions).values(rows)
    }
    console.log(`✔ 角色权限 ${roleCode}: ${rows.length}`)
  }
}

async function seedAdmin() {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, ADMIN_EMAIL)).limit(1)
  if (existing) {
    console.log(`• 管理员已存在：${ADMIN_EMAIL}`)
    return
  }

  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.code, 'superadmin')).limit(1)
  if (!role) {
    throw new Error('缺少 superadmin 角色')
  }

  await db.insert(schema.users).values({
    email: ADMIN_EMAIL,
    username: 'admin',
    passwordHash: await scryptHash(ADMIN_PASSWORD),
    roleId: role.id,
    status: 'active',
    emailVerifiedAt: new Date()
  })

  console.log(`✔ 管理员已创建：${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
}

async function seedPlans() {
  const existing = await db.select().from(schema.plans).limit(1)
  if (existing.length > 0) {
    return
  }

  await db.insert(schema.plans).values([
    {
      name: '体验套餐',
      slug: 'trial',
      description: '小流量体验，适合新用户',
      type: 'traffic',
      price: '5.00',
      trafficGb: 10,
      durationDays: 7,
      deviceLimit: 1,
      status: 'active',
      isHot: false,
      sort: 1
    },
    {
      name: '月度套餐',
      slug: 'monthly',
      description: '100GB 流量，有效期 30 天',
      type: 'traffic',
      price: '25.00',
      trafficGb: 100,
      durationDays: 30,
      deviceLimit: 3,
      status: 'active',
      isHot: true,
      sort: 2
    },
    {
      name: '季度套餐',
      slug: 'quarterly',
      description: '500GB 流量，有效期 90 天',
      type: 'traffic',
      price: '68.00',
      trafficGb: 500,
      durationDays: 90,
      deviceLimit: 5,
      status: 'active',
      isHot: false,
      sort: 3
    }
  ])

  console.log('✔ 示例商品 3 个')
}

async function main() {
  await seedRoles()
  await seedPermissions()
  await seedRolePermissions()
  await seedAdmin()
  await seedPlans()
  await pool.end()
  console.log('\n✔ 初始化完成')
}

main().catch(async (error) => {
  console.error('✖ 初始化失败：', error)
  await pool.end()
  process.exit(1)
})
