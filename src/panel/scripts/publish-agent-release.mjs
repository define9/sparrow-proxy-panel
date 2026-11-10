#!/usr/bin/env node
/**
 * 把发布脚本产出的 panel-release.json 写进面板 settings 表（key = agent_release）。
 *
 *   node scripts/publish-agent-release.mjs [panel-release.json] [--dry-run]
 *
 * 默认读 <repo>/src/agent/dist/release/panel-release.json（scripts/release.sh --upload 的产物）。
 * 面板只保存「在哪下载、sha256 是多少」，二进制本体留在 GitHub Release。
 *
 * 依赖已有依赖（pg），不引入新包；连接串取 DATABASE_URL，缺失时尝试 src/panel/.env。
 * 幂等：同版本重复执行只会覆盖成同样的值，不报错。
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url)) // src/panel/scripts
const REPO_ROOT = resolve(HERE, '../../..')
const PANEL_ROOT = resolve(HERE, '..')
const SETTINGS_KEY = 'agent_release'
const SHA256_RE = /^[0-9a-f]{64}$/i

function log(...args) {
  console.log('[publish-agent-release]', ...args)
}

function die(message) {
  console.error('[publish-agent-release] 错误：' + message)
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const fileArg = args.find((arg) => !arg.startsWith('-'))

const manifestPath = fileArg
  ? isAbsolute(fileArg)
    ? fileArg
    : resolve(process.cwd(), fileArg)
  : join(REPO_ROOT, 'src/agent/dist/release/panel-release.json')

function loadEnv() {
  if (process.env.DATABASE_URL) return
  const envFile = join(PANEL_ROOT, '.env')
  try {
    process.loadEnvFile(envFile)
    log('已从', envFile, '读取环境变量')
  } catch {
    // 没有 .env 就继续，后面会提示缺少 DATABASE_URL
  }
}

/** 只接受 install.sh / 面板接口认得的形状，脏数据不如不写 */
function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    die('清单不是 JSON 对象')
  }
  const source = raw.source === 'custom-url' ? 'custom-url' : 'github'
  const assets = raw.assets
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    die('清单缺少 assets 对象')
  }

  const clean = {}
  const invalid = []
  for (const [platform, value] of Object.entries(assets)) {
    const url = value && typeof value.url === 'string' ? value.url.trim() : ''
    const sha256 = value && typeof value.sha256 === 'string' ? value.sha256.trim().toLowerCase() : ''
    if (!url || !SHA256_RE.test(sha256)) {
      invalid.push(platform)
      continue
    }
    clean[platform] = { url, sha256 }
  }
  if (Object.keys(clean).length === 0) {
    die('assets 里没有可用的条目（需要 url + 64 位 sha256）')
  }
  if (invalid.length > 0) {
    die(`以下平台缺少 url 或合法 sha256：${invalid.join(', ')}`)
  }

  const tag = typeof raw.tag === 'string' ? raw.tag : ''
  const version =
    typeof raw.version === 'string' && raw.version.trim()
      ? raw.version.trim()
      : (/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(tag)?.[1] ?? '')

  return {
    source,
    repo: typeof raw.repo === 'string' ? raw.repo : '',
    tag,
    version,
    channel: typeof raw.channel === 'string' && raw.channel ? raw.channel : 'stable',
    assets: clean,
    installScript:
      typeof raw.installScript === 'string' && raw.installScript
        ? raw.installScript
        : '/agent/install.sh',
    signature: typeof raw.signature === 'string' ? raw.signature : ''
  }
}

async function main() {
  let text
  try {
    text = readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')
  } catch (error) {
    die(`读不到清单 ${manifestPath}（先跑 scripts/release.sh）：${error.message}`)
  }

  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    die(`清单不是合法 JSON：${error.message}`)
  }

  const config = validate(raw)
  const value = JSON.stringify(config)
  const platforms = Object.keys(config.assets)

  log(`清单 ${manifestPath}`)
  log(`版本 ${config.version || '(未知)'} · 通道 ${config.channel} · 源 ${config.source}${config.repo ? ' ' + config.repo : ''}`)
  log(`平台 ${platforms.join(', ')}`)

  loadEnv()
  const url = process.env.DATABASE_URL
  if (!url) die('缺少 DATABASE_URL（或在 src/panel/.env 里配置）')

  if (dryRun) {
    log('--dry-run：不写库。将写入 settings key =', SETTINGS_KEY)
    log(value)
    return
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY])
    const previous = rows[0]?.value

    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [SETTINGS_KEY, value]
    )

    if (previous === value) {
      log('已是最新（内容相同），无需变更')
    } else {
      log(previous ? '已更新 settings.' + SETTINGS_KEY : '已写入 settings.' + SETTINGS_KEY)
    }
    log('完成。节点侧可访问 /api/v1/public/agent/release 与 /agent/install.sh')
  } finally {
    await client.end()
  }
}

main().catch((error) => die(error?.stack ?? String(error)))
