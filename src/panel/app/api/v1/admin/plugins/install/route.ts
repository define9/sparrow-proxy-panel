import { ApiError, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'

/**
 * git URL 安装流水线尚未实现（docs/architecture/plugin-system.md §6）。
 * 这里明确返回 501，不伪造安装成功、不写 plugins 表。
 */
export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:plugin:write')

  const body = (await req.json().catch(() => ({}))) as { repoUrl?: unknown; ref?: unknown }
  const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl.trim() : ''

  if (!repoUrl) {
    throw new ApiError(422, 'PLUGIN_REPO_REQUIRED', '请提供 repoUrl（https 形式的 Git 仓库地址）')
  }

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email, type: 'user' },
    {
      action: 'plugin.install.attempt',
      targetType: 'plugin',
      targetId: repoUrl,
      level: 'warn',
      message: `尝试安装插件 ${repoUrl}，安装流水线未实现，已拒绝`,
      meta: { repoUrl }
    }
  )

  throw new ApiError(
    501,
    'PLUGIN_INSTALL_NOT_IMPLEMENTED',
    'git URL 安装流水线尚未实现（见 docs/architecture/plugin-system.md §6）：当前不支持从仓库拉取、构建与探活插件，请等待后续版本。'
  )
})
