'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import {
  CircleAlert,
  CloudDownload,
  Download,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Search,
  Star,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { EmptyState } from '@/components/common/empty-state'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDay } from '@/lib/format'
import {
  apiErrorMessage,
  isBackendMissing,
  useActivateTheme,
  useAdminThemes,
  useDiscoverThemes,
  useInstallTheme,
  usePreviewTheme,
  useUninstallTheme,
  type DiscoverThemeItemDto,
  type InstalledThemeDto,
  type ThemeListDto,
  type ThemePreviewDto
} from '@/lib/api/themes'

const EMPTY_LIST: ThemeListDto = {
  active: null,
  themes: [],
  builtin: { key: 'default', name: '面板默认落地页' }
}

const BUILTIN_KEY = 'default'

/** `owner/repo@sha 前 7 位` */
function repoLabel(repoUrl: string, commitSha?: string | null) {
  const repo = repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
  return commitSha ? `${repo}@${commitSha.slice(0, 7)}` : repo
}

function describeError(error: unknown) {
  if (isBackendMissing(error)) {
    return '后端主题接口未就绪（404），等接口合并后即可使用。'
  }
  return apiErrorMessage(error)
}

/* ------------------------------------------------------------ 当前主题 */

interface CurrentThemeProps {
  list: ThemeListDto
  activeTheme: InstalledThemeDto | null
  pending: boolean
  onRestoreDefault: () => void
}

function CurrentTheme({ list, activeTheme, pending, onRestoreDefault }: CurrentThemeProps) {
  const isBuiltin = !activeTheme

  return (
    <Card>
      <CardHeader>
        <CardTitle>当前主题</CardTitle>
        <CardDescription>前台落地页正在使用的主题</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Palette />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {activeTheme ? activeTheme.name : list.builtin.name}
              <Badge variant={isBuiltin ? 'outline' : 'success'}>使用中</Badge>
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {activeTheme
                ? `${activeTheme.version} · ${repoLabel(activeTheme.repoUrl, activeTheme.commitSha)}`
                : `内置 · ${list.builtin.key}`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="sm:ml-auto"
            disabled={pending || isBuiltin}
            onClick={onRestoreDefault}
          >
            {pending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            恢复默认
          </Button>
        </div>

        <Alert>
          <Info data-icon="inline-start" />
          <AlertTitle>主题只影响落地页与前台页面</AlertTitle>
          <AlertDescription>
            <code>/admin</code> 与 <code>/dashboard</code> 始终由面板自身渲染，不受主题影响；切换主题不会影响已登录用户的操作界面。
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------ 已安装 */

function ThemePreviewThumb({ theme }: { theme: InstalledThemeDto }) {
  if (!theme.previewUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
        <Palette />
      </div>
    )
  }

  return (
    <Image
      src={theme.previewUrl}
      alt={`${theme.name} 预览图`}
      width={640}
      height={360}
      unoptimized
      className="aspect-video w-full bg-muted object-cover"
    />
  )
}

interface InstalledThemesProps {
  list: ThemeListDto
  isLoading: boolean
  isError: boolean
  error: unknown
  activatingKey: string | null
  onActivate: (key: string) => void
  onRequestUninstall: (theme: InstalledThemeDto) => void
  onRetry: () => void
}

function InstalledThemes({
  list,
  isLoading,
  isError,
  error,
  activatingKey,
  onActivate,
  onRequestUninstall,
  onRetry
}: InstalledThemesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>已安装主题</CardTitle>
        <CardDescription>安装后固定到 commit，作者后续推送不会自动生效</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-64 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <CircleAlert data-icon="inline-start" />
            <AlertTitle>主题列表加载失败</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{describeError(error)}</span>
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            </AlertDescription>
          </Alert>
        ) : list.themes.length === 0 ? (
          <EmptyState
            icon={Palette}
            title="还没有安装任何主题"
            description="从下方 GitHub 发现列表中挑选，或直接填入主题仓库的 git URL。"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.themes.map((theme) => {
              const active = list.active === theme.key
              const activating = activatingKey === theme.key

              return (
                <Card key={theme.key} size="sm">
                  <ThemePreviewThumb theme={theme} />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {theme.name}
                      {active ? <Badge variant="success">使用中</Badge> : null}
                    </CardTitle>
                    <CardDescription className="truncate font-mono text-xs">
                      {repoLabel(theme.repoUrl, theme.commitSha)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 pb-3 text-xs text-muted-foreground">
                    <span className="font-mono">v{theme.version}</span>
                    <span>安装于 {formatDate(theme.installedAt)}</span>
                  </CardContent>
                  <CardFooter className="gap-2 border-t-0 bg-transparent p-0 px-3 pb-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={active || activating}
                      onClick={() => onActivate(theme.key)}
                    >
                      {activating ? (
                        <Loader2 data-icon="inline-start" className="animate-spin" />
                      ) : null}
                      {active ? '使用中' : '启用'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={activating}
                      onClick={() => onRequestUninstall(theme)}
                    >
                      <Trash2 data-icon="inline-start" />
                      卸载
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------ 发现 */

interface DiscoverProps {
  installedKeys: Set<string>
  onInstalled: () => void
}

function DiscoverThemes({ installedKeys, onInstalled }: DiscoverProps) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const search = useDiscoverThemes()
  const install = useInstallTheme()

  const items = useMemo(() => {
    const rows = search.data?.items ?? []
    const keyword = appliedQuery.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(
      (item) =>
        item.fullName.toLowerCase().includes(keyword) ||
        (item.description ?? '').toLowerCase().includes(keyword)
    )
  }, [search.data, appliedQuery])

  function isInstalled(item: DiscoverThemeItemDto) {
    return item.installed || Boolean(item.installedKey && installedKeys.has(item.installedKey))
  }

  async function handleInstall(item: DiscoverThemeItemDto) {
    try {
      const result = await install.mutateAsync({ repoUrl: item.htmlUrl })
      toast.success(`已安装 ${result.name} v${result.version}`)
      onInstalled()
      search.mutate(appliedQuery.trim())
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const installingUrl = install.isPending ? install.variables?.repoUrl : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>从 GitHub 发现</CardTitle>
        <CardDescription>搜索社区主题仓库，安装前会读取仓库里的 manifest</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            const next = query.trim()
            setAppliedQuery(next)
            search.mutate(next)
          }}
        >
          <Input
            value={query}
            placeholder="按主题名称或描述搜索，例如 neon"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索 GitHub 主题"
          />
          <Button type="submit" variant="outline" disabled={search.isPending}>
            {search.isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Search data-icon="inline-start" />
            )}
            搜索
          </Button>
        </form>

        {search.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : search.isError ? (
          <Alert variant="destructive">
            <CircleAlert data-icon="inline-start" />
            <AlertTitle>GitHub 搜索失败</AlertTitle>
            <AlertDescription>
              {describeError(search.error)}
              <br />
              GitHub 可能限流（未认证请求每小时 60 次）或当前网络不可达。你仍然可以在下方「手动安装」里填写 git URL。
            </AlertDescription>
          </Alert>
        ) : !search.data ? (
          <EmptyState
            icon={CloudDownload}
            title="搜索社区主题"
            description="输入关键词后点「搜索」；没有结果时可在下方手动填写仓库地址。"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CloudDownload}
            title="没有匹配的主题"
            description="换个关键词，或者直接在「手动安装」里填写 git URL。"
          />
        ) : (
          <div className="flex flex-col divide-y">
            {items.map((item) => {
              const installed = isInstalled(item)
              const installing = installingUrl === item.htmlUrl

              return (
                <div
                  key={item.fullName}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{item.fullName}</span>
                      {installed ? <Badge variant="secondary">已安装</Badge> : null}
                    </span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {item.description || '仓库没有填写描述'}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="size-3" />
                        {item.stars}
                      </span>
                      <span>更新于 {formatDay(item.updatedAt)}</span>
                      <span className="font-mono">{item.defaultBranch}</span>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={installed ? 'outline' : 'default'}
                    disabled={installed || installing}
                    onClick={() => handleInstall(item)}
                  >
                    {installing ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Download data-icon="inline-start" />
                    )}
                    {installed ? '已安装' : '安装'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------ 手动安装 */

function ManualInstall({ installedKeys }: { installedKeys: Set<string> }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [gitRef, setGitRef] = useState('')
  const [preview, setPreview] = useState<ThemePreviewDto | null>(null)
  const previewTheme = usePreviewTheme()
  const install = useInstallTheme()

  const urlMissing = !repoUrl.trim()
  const urlInvalid =
    !urlMissing && !/^(https:\/\/|git@)[\w.\-/:]+?(#[^\s]+)?$/.test(repoUrl.trim())

  function resetPreview() {
    setPreview(null)
    previewTheme.reset()
    install.reset()
  }

  async function handlePreview() {
    if (urlMissing || urlInvalid) return
    try {
      setPreview(await previewTheme.mutateAsync(repoUrl.trim()))
    } catch {
      setPreview(null)
    }
  }

  async function handleInstall() {
    if (!preview) return
    try {
      const result = await install.mutateAsync({
        repoUrl: repoUrl.trim(),
        ref: gitRef.trim() || undefined
      })
      toast.success(`已安装 ${result.name} v${result.version}`)
      setPreview(null)
      setRepoUrl('')
      setGitRef('')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const alreadyInstalled = preview ? installedKeys.has(preview.key) : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>手动安装</CardTitle>
        <CardDescription>任何包含 manifest 与 dist/ 构建产物的前端仓库都可以安装</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="theme-repo-url">仓库地址</FieldLabel>
            <Input
              id="theme-repo-url"
              value={repoUrl}
              placeholder="https://github.com/foo/sparrow-theme-neon"
              onChange={(event) => {
                setRepoUrl(event.target.value)
                resetPreview()
              }}
            />
            <FieldDescription>
              支持 GitHub、自建 Git 的 https 地址；<code className="font-mono">#tag</code>{' '}
              写在地址末尾也可以。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="theme-repo-ref">分支 / 标签（可选）</FieldLabel>
            <Input
              id="theme-repo-ref"
              value={gitRef}
              placeholder="v1.2.0 或 main"
              onChange={(event) => setGitRef(event.target.value)}
            />
            <FieldDescription>留空时使用仓库默认分支的最新提交。</FieldDescription>
          </Field>
        </FieldGroup>

        {urlInvalid ? (
          <p className="text-sm text-destructive">
            仓库地址格式不对，例如 https://github.com/foo/sparrow-theme-neon
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={urlMissing || Boolean(urlInvalid) || previewTheme.isPending}
            onClick={handlePreview}
          >
            {previewTheme.isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Search data-icon="inline-start" />
            )}
            预览
          </Button>
          <Button
            disabled={!preview || install.isPending || alreadyInstalled}
            onClick={handleInstall}
          >
            {install.isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            确认安装
          </Button>
        </div>

        {previewTheme.isError ? (
          <Alert variant="destructive">
            <CircleAlert data-icon="inline-start" />
            <AlertTitle>预览失败</AlertTitle>
            <AlertDescription>{describeError(previewTheme.error)}</AlertDescription>
          </Alert>
        ) : null}

        {install.isError ? (
          <Alert variant="destructive">
            <CircleAlert data-icon="inline-start" />
            <AlertTitle>安装失败</AlertTitle>
            <AlertDescription>{describeError(install.error)}</AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{preview.name}</span>
              <Badge variant="outline">v{preview.version}</Badge>
              {alreadyInstalled ? <Badge variant="secondary">已安装</Badge> : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {preview.key}
              {preview.author ? ` · ${preview.author}` : ''}
            </span>
            <p className="text-sm text-muted-foreground">
              {preview.description || '作者没有填写描述'}
            </p>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">接管路径</span>
              <div className="flex flex-wrap gap-1">
                {[preview.basePath, ...(preview.routes ?? [])]
                  .filter(Boolean)
                  .map((route, index) => (
                    <Badge key={`${route}-${index}`} variant="outline" className="font-mono">
                      {route}
                    </Badge>
                  ))}
              </div>
            </div>

            {preview.warnings?.length ? (
              <Alert>
                <TriangleAlert data-icon="inline-start" />
                <AlertTitle>预览警告</AlertTitle>
                <AlertDescription>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------ 作者说明 */

function AuthorNotes() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>给主题作者</CardTitle>
        <CardDescription>主题是独立前端项目，面板只负责托管与路由</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          主题是<strong className="text-foreground">独立前端项目</strong>，需要在仓库里提交构建产物{' '}
          <code className="font-mono">dist/</code>；面板不执行任何构建脚本，也不会安装仓库的依赖。
        </p>
        <p>
          运行时主题通过同源的 <code className="font-mono">/api/v1/public/*</code> 取数据；未登录用户会被引导到{' '}
          <code className="font-mono">/login</code>，主题内不要自行请求其它域的接口。
        </p>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------ 卸载确认 */

interface ConfirmUninstallProps {
  theme: InstalledThemeDto | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmUninstall({ theme, pending, onCancel, onConfirm }: ConfirmUninstallProps) {
  return (
    <AlertDialogPrimitive.Root
      open={Boolean(theme)}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel()
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <AlertDialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <AlertDialogPrimitive.Title className="font-heading text-base font-medium">
            卸载「{theme?.name}」？
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
            会删除主题文件与安装记录。如果它正是当前主题，前台会自动回落到面板默认落地页。
          </AlertDialogPrimitive.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                取消
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              确认卸载
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

/* ------------------------------------------------------------ 主体 */

export function ThemeManager() {
  const { data, isLoading, isError, error, refetch } = useAdminThemes()
  const activate = useActivateTheme()
  const uninstall = useUninstallTheme()

  const [pendingUninstall, setPendingUninstall] = useState<InstalledThemeDto | null>(null)
  const [activation, setActivation] = useState<string | null>(null)

  const list = data ?? EMPTY_LIST
  const backendMissing = isError && isBackendMissing(error)
  const activeTheme =
    list.active && list.active !== BUILTIN_KEY
      ? (list.themes.find((theme) => theme.key === list.active) ?? null)
      : null
  const installedKeys = useMemo(
    () => new Set(list.themes.map((theme) => theme.key)),
    [list.themes]
  )

  async function activateTheme(key: string) {
    setActivation(key)
    try {
      await activate.mutateAsync(key)
      toast.success(key === BUILTIN_KEY ? '已恢复面板默认落地页' : '主题已启用')
    } catch (cause) {
      toast.error(describeError(cause))
    } finally {
      setActivation(null)
    }
  }

  async function confirmUninstall() {
    if (!pendingUninstall) return
    try {
      await uninstall.mutateAsync(pendingUninstall.key)
      toast.success(`已卸载 ${pendingUninstall.name}`)
      setPendingUninstall(null)
    } catch (cause) {
      toast.error(describeError(cause))
    }
  }

  const activatingKey = activation

  return (
    <div className="flex flex-col gap-6">
      {backendMissing ? (
        <Alert>
          <Info data-icon="inline-start" />
          <AlertTitle>后端接口未就绪</AlertTitle>
          <AlertDescription>
            <code className="font-mono">/api/v1/admin/themes</code> 还没有上线（404），页面先按空数据展示。接口合并后刷新即可管理主题。
          </AlertDescription>
        </Alert>
      ) : null}

      <CurrentTheme
        list={list}
        activeTheme={activeTheme}
        pending={activation === BUILTIN_KEY}
        onRestoreDefault={() => activateTheme(BUILTIN_KEY)}
      />

      <InstalledThemes
        list={list}
        isLoading={isLoading}
        isError={isError && !backendMissing}
        error={error}
        activatingKey={activatingKey}
        onActivate={activateTheme}
        onRequestUninstall={setPendingUninstall}
        onRetry={() => refetch()}
      />

      <DiscoverThemes
        installedKeys={installedKeys}
        onInstalled={() => {
          void refetch()
        }}
      />

      <ManualInstall installedKeys={installedKeys} />

      <AuthorNotes />

      <ConfirmUninstall
        theme={pendingUninstall}
        pending={uninstall.isPending}
        onCancel={() => setPendingUninstall(null)}
        onConfirm={confirmUninstall}
      />
    </div>
  )
}
