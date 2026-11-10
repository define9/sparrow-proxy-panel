import { z } from 'zod'

/**
 * 主题管理端入参 schema（route 用来校验，前端可复用）。
 * URL 的合法性（是否 github.com、是否 https）在 lib/themes/install.ts 里判定，
 * 这样错误信息能说明「为什么不允许」而不是一句 "format invalid"。
 */

export const themeRepoInputSchema = z.object({
  repoUrl: z.string().trim().min(1, '请填写主题仓库地址').max(500, '仓库地址过长'),
  /** 显式 ref；也可以写在 repoUrl 的 #tag / #branch / #commit 后缀里 */
  ref: z.string().trim().max(200).optional()
})

export type ThemeRepoInput = z.infer<typeof themeRepoInputSchema>

export const themeDiscoverQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  source: z.enum(['github', 'releases']).default('github')
})

export type ThemeDiscoverQuery = z.infer<typeof themeDiscoverQuerySchema>
