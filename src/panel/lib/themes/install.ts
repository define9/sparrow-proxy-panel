import 'server-only'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { and, eq, ne } from 'drizzle-orm'
import { ApiError } from '@/lib/api/response'
import { db } from '@/lib/db'
import { invalidateThemeCache } from './runtime'
import { plugins, taskRuns } from '@/lib/db/schema'
import {
  parseThemeManifestJson,
  validateThemeManifest,
  type ThemeManifest
} from './manifest'
import {
  cleanupDir,
  createThemeTempDir,
  hasThemeFiles,
  readThemeManifestFile,
  readThemeMeta,
  stageTheme
} from './store'

/**
 * 主题安装流水线：解析仓库 → 解析 ref → 浅克隆 → 校验 manifest → 物化 → 写库。
 *
 * 三条硬约束：
 * 1. **只接受 https://github.com/<owner>/<repo>**（不做凭据管理、不接受 git@/ssh/ext）；
 * 2. **面板绝不执行仓库里的代码**：不跑 npm install / build，仓库必须自带构建产物；
 * 3. 失败必须清掉临时目录，且不影响已安装的旧版本（stage 阶段才动主题目录）。
 */

const execFileAsync = promisify(execFile)

/** clone 60s / ls-remote、fetch 30s：小仓库几秒内完成，超时即失败 */
const CLONE_TIMEOUT_MS = 60_000
const REMOTE_TIMEOUT_MS = 30_000
const GITHUB_HOST = 'github.com'

export interface ParsedThemeRepo {
  /** 规范化后的仓库地址（不含 #ref） */
  url: string
  owner: string
  repo: string
}

export interface ResolvedThemeRef {
  sha: string
  /** 解析出来的 ref 名称（分支 / tag）；按 commit 安装时为 null */
  refName: string | null
  kind: 'branch' | 'tag' | 'commit' | 'head'
}

export interface InstallThemeResult {
  key: string
  name: string
  version: string
  commitSha: string
  repoUrl: string
  ref: string | null
  previousVersion: string | null
  /** dist 目录的 sha256，管理端展示与回滚校验用 */
  distSha256: string
}

export interface PreviewThemeResult {
  key: string
  name: string
  version: string
  author: string
  description: string
  panel: string
  basePath: string
  output: string
  routes: ThemeManifest['routes']
  preview: string | null
  repoUrl: string
  commitSha: string
  ref: string | null
  /** 本机是否已安装同 key（已安装则本次安装等于升级） */
  installed: boolean
  installedVersion: string | null
  /** 已安装的仓库地址（用于提示来源变化） */
  installedRepoUrl: string | null
  warnings: string[]
}

/* --------------------------------- 参数解析 --------------------------------- */

/**
 * 解析 repoUrl：支持 `https://github.com/owner/repo` 与 `#ref` 后缀。
 * 拒绝 http / ssh / git@ / ext:: / file://（git 的 ext 协议等价于任意命令执行）。
 */
export function parseThemeRepoUrl(input: string): ParsedThemeRepo {
  const raw = input.trim().replace(/\/+$/, '')
  if (!raw) {
    throw new ApiError(422, 'THEME_REPO_REQUIRED', '请提供 repoUrl（https 形式的 GitHub 仓库地址）')
  }

  if (/^(ssh|git|ext|file|ftp):/i.test(raw) || raw.startsWith('git@')) {
    throw new ApiError(
      422,
      'THEME_REPO_UNSUPPORTED',
      '只支持 https://github.com/<owner>/<repo> 形式的公开仓库地址：ssh / git@ / ext:: / file:// 一律拒绝'
    )
  }

  if (raw.startsWith('http://')) {
    throw new ApiError(422, 'THEME_REPO_UNSUPPORTED', '只支持 https 地址，不接受 http://')
  }

  const match = /^https:\/\/([^/]+)\/([^/#]+)\/([^/#]+?)(?:\.git)?(?:#(.*))?$/i.exec(raw)
  if (!match) {
    throw new ApiError(
      422,
      'THEME_REPO_UNSUPPORTED',
      '仓库地址格式不正确，应为 https://github.com/<owner>/<repo>（可用 #tag 或 #branch 指定版本）'
    )
  }

  const host = (match[1] ?? '').toLowerCase()
  const owner = match[2] ?? ''
  const repo = (match[3] ?? '').replace(/\.git$/i, '')

  if (host !== GITHUB_HOST) {
    throw new ApiError(
      422,
      'THEME_REPO_UNSUPPORTED',
      `当前只支持 github.com 上的主题仓库，暂不支持 ${host}`
    )
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new ApiError(422, 'THEME_REPO_UNSUPPORTED', '仓库 owner / repo 含有非法字符')
  }

  return {
    url: `https://${GITHUB_HOST}/${owner}/${repo}`,
    owner,
    repo
  }
}

/** 从 URL 或独立的 ref 参数里取 ref；两处都有时以显式 ref 为准 */
export function extractRepoRef(repoUrl: string, ref?: string | null): string | null {
  const explicit = ref?.trim()
  const resolved = explicit
    ? explicit
    : repoUrl.includes('#')
      ? repoUrl.slice(repoUrl.indexOf('#') + 1).trim()
      : ''

  if (!resolved) return null

  // git 会把 "-" 开头的参数当选项；只放行正常的分支/tag/sha 字符
  if (!/^[A-Za-z0-9._/+-]+$/.test(resolved)) {
    throw new ApiError(
      422,
      'THEME_REF_INVALID',
      `ref "${resolved}" 含有非法字符（只允许字母、数字与 . _ / + -）`
    )
  }

  return resolved
}

/* ----------------------------------- git ---------------------------------- */

function gitProtocolArgs(): string[] {
  // 只允许 https：默认禁掉所有协议，再单独放开 https
  // （ssh / git@ / file:// / ext:: 一律拒绝；ext 等价于任意命令执行）
  return [
    '-c',
    'protocol.allow=never',
    '-c',
    'protocol.https.allow=always',
    '-c',
    'protocol.version=2',
    '-c',
    'credential.helper='
  ]
}

async function git(args: string[], timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GIT_CONFIG_NOSYSTEM: '1'
      }
    })
    return stdout
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (err.killed) {
      throw new ApiError(
        504,
        'THEME_GIT_TIMEOUT',
        `git 操作超时（${Math.round(timeoutMs / 1000)}s），请检查网络或稍后重试`
      )
    }
    const detail = (err.stderr ?? err.message ?? '').toString().trim().split('\n').slice(-3).join(' ')
    throw new ApiError(
      502,
      'THEME_GIT_FAILED',
      `git 操作失败：${detail || '未知错误'}（确认仓库是公开可访问的 https 地址）`
    )
  }
}

/** 解析 ref → commit sha；无 ref 时取默认分支 HEAD */
export async function resolveThemeRef(
  repo: ParsedThemeRepo,
  ref?: string | null
): Promise<ResolvedThemeRef> {
  const protocolArgs = gitProtocolArgs()

  if (!ref) {
    const output = await git([...protocolArgs, 'ls-remote', repo.url, 'HEAD'], REMOTE_TIMEOUT_MS)
    const sha = output.trim().split(/\s+/)[0]
    if (!sha) {
      throw new ApiError(422, 'THEME_REF_NOT_FOUND', '无法读取仓库默认分支（可能为空仓库）')
    }
    return { sha, refName: null, kind: 'head' }
  }

  const output = await git(
    [...protocolArgs, 'ls-remote', '--heads', '--tags', repo.url],
    REMOTE_TIMEOUT_MS
  )

  const refs = new Map<string, string>()
  for (const line of output.split('\n')) {
    const [sha, name] = line.trim().split(/\s+/)
    if (sha && name) refs.set(name, sha)
  }

  // tag 优先（annotated tag 用 ^{} 指向真正的 commit）
  const candidates: { name: string; kind: 'branch' | 'tag' }[] = [
    { name: `refs/tags/${ref}^{}`, kind: 'tag' },
    { name: `refs/tags/${ref}`, kind: 'tag' },
    { name: `refs/heads/${ref}`, kind: 'branch' },
    { name: ref, kind: 'branch' }
  ]

  for (const candidate of candidates) {
    const sha = refs.get(candidate.name)
    if (sha) return { sha, refName: ref, kind: candidate.kind }
  }

  if (/^[0-9a-f]{4,40}$/i.test(ref)) {
    return { sha: ref.toLowerCase(), refName: null, kind: 'commit' }
  }

  throw new ApiError(
    422,
    'THEME_REF_NOT_FOUND',
    `仓库里找不到 ref "${ref}"（既不是 tag 也不是分支）`
  )
}

async function cloneRepo(
  repo: ParsedThemeRepo,
  resolved: ResolvedThemeRef,
  targetDir: string
): Promise<void> {
  const protocolArgs = gitProtocolArgs()

  if (resolved.kind === 'branch' || resolved.kind === 'tag') {
    await git(
      [
        ...protocolArgs,
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        resolved.refName ?? '',
        '--no-recurse-submodules',
        repo.url,
        targetDir
      ],
      CLONE_TIMEOUT_MS
    )
    return
  }

  await git(
    [...protocolArgs, 'clone', '--depth', '1', '--no-recurse-submodules', repo.url, targetDir],
    CLONE_TIMEOUT_MS
  )

  if (resolved.kind === 'commit') {
    await git(
      [...protocolArgs, '-C', targetDir, 'fetch', '--depth', '1', 'origin', resolved.sha],
      REMOTE_TIMEOUT_MS
    )
    await git([...protocolArgs, '-C', targetDir, 'checkout', '--detach', resolved.sha], REMOTE_TIMEOUT_MS)
  }
}

/* -------------------------------- 产物校验 -------------------------------- */

async function assertBuildOutput(repoDir: string, manifest: ThemeManifest): Promise<string> {
  const outputDir = path.resolve(repoDir, manifest.output)
  const repoRoot = path.resolve(repoDir)

  if (outputDir !== repoRoot && !outputDir.startsWith(`${repoRoot}${path.sep}`)) {
    throw new ApiError(422, 'THEME_OUTPUT_INVALID', 'output 不能指向仓库之外')
  }

  let isDir = false
  try {
    isDir = (await stat(outputDir)).isDirectory()
  } catch {
    isDir = false
  }

  if (!isDir) {
    throw new ApiError(
      422,
      'THEME_BUILD_OUTPUT_MISSING',
      '该仓库未包含构建产物（dist/），请让作者提交构建结果或改用其它分发方式'
    )
  }

  try {
    const indexStat = await stat(path.join(outputDir, 'index.html'))
    if (!indexStat.isFile()) throw new Error('not a file')
  } catch {
    throw new ApiError(
      422,
      'THEME_BUILD_OUTPUT_INVALID',
      `${manifest.output}/ 里缺少 index.html：主题必须是构建好的静态站点（面板只做静态托管，不执行构建）`
    )
  }

  return outputDir
}

/* ------------------------------ task_runs 记录 ----------------------------- */

async function startTaskRun(meta: Record<string, unknown>): Promise<string | null> {
  try {
    const [row] = await db
      .insert(taskRuns)
      .values({ name: 'theme.install', status: 'running', meta: JSON.stringify(meta) })
      .returning({ id: taskRuns.id })
    return row?.id ?? null
  } catch (error) {
    // 任务日志写失败不能阻断安装主流程，但要留痕
    console.warn('[themes] 写入 task_runs 失败', error)
    return null
  }
}

async function finishTaskRun(
  id: string | null,
  status: 'ok' | 'failed',
  meta: Record<string, unknown>,
  error?: string
): Promise<void> {
  if (!id) return
  try {
    await db
      .update(taskRuns)
      .set({ status, finishedAt: new Date(), meta: JSON.stringify(meta), error: error ?? null })
      .where(eq(taskRuns.id, id))
  } catch (updateError) {
    console.warn('[themes] 更新 task_runs 失败', updateError)
  }
}

/* --------------------------------- 写库 ---------------------------------- */

async function upsertThemeRow(input: {
  manifest: ThemeManifest
  repoUrl: string
  commitSha: string
  ref: string | null
  distSha256: string
  previousVersion: string | null
}): Promise<void> {
  const { manifest } = input

  // plugins 上有 (repo_url, commit_sha) 唯一索引：同一提交不能同时挂两个主题 key
  const [conflict] = await db
    .select({ key: plugins.key })
    .from(plugins)
    .where(
      and(
        eq(plugins.repoUrl, input.repoUrl),
        eq(plugins.commitSha, input.commitSha),
        ne(plugins.key, manifest.key)
      )
    )
    .limit(1)

  if (conflict) {
    throw new ApiError(
      409,
      'THEME_REPO_COMMIT_CONFLICT',
      `该仓库的提交 ${input.commitSha.slice(0, 7)} 已被主题 "${conflict.key}" 使用（manifest 的 key 与已安装主题不一致）`
    )
  }

  const values = {
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    type: 'theme' as const,
    sourceType: 'git',
    repoUrl: input.repoUrl,
    gitRef: input.ref,
    commitSha: input.commitSha,
    runtime: 'static',
    entry: 'dist/index.html',
    build: 'none',
    uiMode: 'static',
    checksum: input.distSha256,
    manifest: JSON.stringify(manifest),
    status: 'installed' as const,
    activeVersion: manifest.version,
    previousVersion: input.previousVersion,
    lastError: null
  }

  await db
    .insert(plugins)
    .values(values)
    .onConflictDoUpdate({
      target: plugins.key,
      set: {
        name: values.name,
        version: values.version,
        type: values.type,
        sourceType: values.sourceType,
        repoUrl: values.repoUrl,
        gitRef: values.gitRef,
        commitSha: values.commitSha,
        runtime: values.runtime,
        entry: values.entry,
        build: values.build,
        uiMode: values.uiMode,
        checksum: values.checksum,
        manifest: values.manifest,
        status: values.status,
        activeVersion: values.activeVersion,
        previousVersion: values.previousVersion,
        lastError: null,
        updatedAt: new Date()
      }
    })
}

/* -------------------------------- 安装 / 预览 ------------------------------- */

export interface InstallThemeInput {
  repoUrl: string
  /** 显式 ref；repoUrl 里的 #ref 也可以 */
  ref?: string | null
}

/** 安装 / 升级主题（同步执行：小仓库几秒，超时受控） */
export async function installThemeFromRepo(input: InstallThemeInput): Promise<InstallThemeResult> {
  const repo = parseThemeRepoUrl(input.repoUrl)
  const ref = extractRepoRef(input.repoUrl, input.ref)

  const startedAt = Date.now()
  const taskMeta: Record<string, unknown> = { repoUrl: repo.url, ref }
  const taskRunId = await startTaskRun(taskMeta)

  const tmp = await createThemeTempDir('install')
  const repoDir = path.join(tmp, 'repo')

  try {
    const resolved = await resolveThemeRef(repo, ref)
    taskMeta.commitSha = resolved.sha
    taskMeta.resolvedRef = resolved.refName

    await cloneRepo(repo, resolved, repoDir)

    const manifest = validateThemeManifest(parseThemeManifestJson(await readThemeManifestFile(repoDir)))
    taskMeta.key = manifest.key
    taskMeta.version = manifest.version

    const outputDir = await assertBuildOutput(repoDir, manifest)

    const staged = await stageTheme({
      key: manifest.key,
      sourceDistDir: outputDir,
      manifest,
      repoUrl: repo.url,
      commitSha: resolved.sha
    })

    await upsertThemeRow({
      manifest,
      repoUrl: repo.url,
      commitSha: resolved.sha,
      ref,
      distSha256: staged.distSha256,
      previousVersion: staged.previousVersion
    })

    await finishTaskRun(taskRunId, 'ok', {
      ...taskMeta,
      previousVersion: staged.previousVersion,
      distSha256: staged.distSha256,
      durationMs: Date.now() - startedAt
    })

    // 新装/升级后主题文件与 manifest 都变了，让运行时缓存失效
    invalidateThemeCache()

    return {
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      commitSha: resolved.sha,
      repoUrl: repo.url,
      ref,
      previousVersion: staged.previousVersion,
      distSha256: staged.distSha256
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishTaskRun(
      taskRunId,
      'failed',
      { ...taskMeta, durationMs: Date.now() - startedAt },
      message
    )
    throw error
  } finally {
    await cleanupDir(tmp)
  }
}

/** 预览：只读 manifest 与权限清单，不落库、不动主题目录 */
export async function previewThemeFromRepo(input: InstallThemeInput): Promise<PreviewThemeResult> {
  const repo = parseThemeRepoUrl(input.repoUrl)
  const ref = extractRepoRef(input.repoUrl, input.ref)

  const tmp = await createThemeTempDir('preview')
  const repoDir = path.join(tmp, 'repo')

  try {
    const resolved = await resolveThemeRef(repo, ref)
    await cloneRepo(repo, resolved, repoDir)

    const manifest = validateThemeManifest(parseThemeManifestJson(await readThemeManifestFile(repoDir)))
    const outputDir = await assertBuildOutput(repoDir, manifest)

    let previewExists = false
    if (manifest.preview) {
      try {
        previewExists = (await stat(path.join(outputDir, manifest.preview))).isFile()
      } catch {
        previewExists = false
      }
    }

    const existingMeta = await readThemeMeta(manifest.key)
    const warnings: string[] = []

    if (existingMeta) {
      warnings.push(`本机已安装 ${manifest.key} v${existingMeta.version}，本次安装会作为升级并保留旧版本备份`)
      if (existingMeta.repoUrl !== repo.url) {
        warnings.push(`已安装版本来自 ${existingMeta.repoUrl}，与本次来源不同`)
      }
    }
    if (manifest.preview && !previewExists) {
      warnings.push(`manifest 声明了截图 ${manifest.preview}，但构建产物里没有这个文件`)
    }

    return {
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      panel: manifest.panel,
      basePath: manifest.basePath,
      output: manifest.output,
      routes: manifest.routes,
      preview: manifest.preview ?? null,
      repoUrl: repo.url,
      commitSha: resolved.sha,
      ref,
      installed: Boolean(existingMeta) && (await hasThemeFiles(manifest.key)),
      installedVersion: existingMeta?.version ?? null,
      installedRepoUrl: existingMeta?.repoUrl ?? null,
      warnings
    }
  } finally {
    await cleanupDir(tmp)
  }
}
