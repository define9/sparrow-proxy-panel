/**
 * 生产环境迁移：只依赖 drizzle-orm + pg（构建镜像里已装）。
 *
 *   node scripts/migrate.mjs
 *
 * 失败以非 0 退出，容器编排会因此中止，不会带着旧表结构启动应用。
 *
 * ⚠️ 自己管账的原因
 *
 * drizzle 的 migrator 用「__drizzle_migrations 里最后一条的 created_at」与 journal 的 when
 * 比较来判断该跑哪些迁移，而且把所有迁移塞进**同一个事务**。对 `ALTER TYPE ... ADD VALUE`
 * 这类迁移有两个坑：
 *
 *   1) PG 12+：新加的枚举值必须提交后才能使用；同一事务里后续语句引用它会报
 *      "New enum values must be committed before they can be used"，整批回滚。
 *   2) 即使不引用，事务里混着多条迁移时，判断与顺序会互相干扰，
 *      出现「drizzle 显示成功、实际没执行」的静默失败（我们踩过）。
 *
 * 所以这里完全自己管账：
 *   - 逐个迁移文件执行；含枚举加值的（标记 `-- +drizzle-enum`）在**事务外**执行
 *   - 每个成功执行的文件，按 drizzle 的规则写一行 __drizzle_migrations
 *     （hash = sha256(文件内容)，created_at = journal 里该迁移的 when）
 *   - 已记账的文件跳过
 * 这样不依赖 drizzle migrator 的排序判断，行为完全可控。
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] 缺少 DATABASE_URL')
  process.exit(1)
}

const folder = './drizzle'
const ENUM_MARKER = '-- +drizzle-enum'

function needsOutOfTransaction(sql) {
  return sql.includes(ENUM_MARKER) || /ALTER\s+TYPE[\s\S]*?ADD\s+VALUE/i.test(sql)
}

/** 与 drizzle-orm 一致的 hash：sha256(文件原始内容) */
function hashOf(content) {
  return createHash('sha256').update(content).digest('hex')
}

/** 读 journal：拿到每个迁移的 when（created_at 用它，排序才对得上） */
function readJournal() {
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'))
  return new Map(journal.entries.map((e) => [e.tag, e.when]))
}

/** 按 statement-breakpoint 拆分（与 drizzle 一致） */
function splitStatements(sql) {
  return sql.split('--> statement-breakpoint').map((s) => s)
}

async function main() {
  const journal = readJournal()
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)

    const { rows: applied } = await client.query(
      'SELECT hash FROM drizzle.__drizzle_migrations'
    )
    const appliedHashes = new Set(applied.map((r) => r.hash))

    const files = readdirSync(folder)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let count = 0
    for (const file of files) {
      const content = readFileSync(join(folder, file), 'utf8')
      const hash = hashOf(content)
      if (appliedHashes.has(hash)) continue

      const tag = file.replace(/\.sql$/, '')
      const when = journal.get(tag)
      if (when === undefined) {
        console.error(`[migrate] ${file} 不在 meta/_journal.json 中，无法记账，跳过`)
        continue
      }

      const statements = splitStatements(content)

      if (needsOutOfTransaction(content)) {
        // 枚举加值：必须事务外执行
        console.log(`[migrate] 事务外执行（枚举加值）: ${file}`)
        for (const stmt of statements) {
          if (stmt.trim()) await client.query(stmt)
        }
      } else {
        console.log(`[migrate] 执行: ${file}`)
        await client.query('BEGIN')
        try {
          for (const stmt of statements) {
            if (stmt.trim()) await client.query(stmt)
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      }

      await client.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [hash, when]
      )
      appliedHashes.add(hash)
      count += 1
    }

    console.log(`[migrate] 完成（本次执行 ${count} 个）`)
  } finally {
    await client.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[migrate] 失败:', error)
    process.exit(1)
  })
