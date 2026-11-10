import { NextResponse, type NextRequest } from 'next/server'
import { handleThemeRequest } from '@/lib/themes/runtime'

const SESSION_COOKIE = 'spx_session'

/** 永远由面板处理的路径前缀（API、Next 内部、品牌资源、后台、订阅输出） */
const PANEL_PREFIXES = ['/api', '/_next', '/brand', '/admin', '/dashboard', '/sub']

/** 永远由面板处理的精确路径（登录态逻辑都在面板里） */
const PANEL_EXACT = new Set([
  '/login',
  '/register',
  '/setup',
  '/forgot-password',
  // Next 生成的元数据路由，不能被主题接管
  '/opengraph-image',
  '/twitter-image',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest'
])

function isPrivatePath(pathname: string): boolean {
  return /^\/(dashboard|admin)(\/|$)/.test(pathname)
}

function isPanelOwned(pathname: string): boolean {
  if (PANEL_EXACT.has(pathname)) return true
  // Next 元数据图片路由带 hash 后缀（/opengraph-image-xxxx）
  if (pathname.startsWith('/opengraph-image') || pathname.startsWith('/twitter-image')) return true
  return PANEL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Next 16 的 proxy（middleware 已废弃，默认 Node.js runtime，可读库/读文件）。
 *
 * 1. 未登录访问 /dashboard|/admin → 跳 /login（原 middleware 逻辑，原样保留）
 * 2. /theme-assets/** → 主题 dist/ 静态文件
 * 3. 其余公开路径 → 有激活主题且命中 routes.include 就交给主题，否则面板
 * 4. /api、/_next、/brand、后台、登录、/sub 永远走面板
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPrivatePath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (isPanelOwned(pathname)) return NextResponse.next()

  // 主题文件缺失/读取失败时返回 null，一律回退面板，绝不 500
  const themed = await handleThemeRequest(pathname, request.method)
  return themed ?? NextResponse.next()
}

export const config = {
  /**
   * 覆盖公开路径（否则主题接管不生效），但排除 Next 静态资源与 public 下的固定文件：
   * 匹配静态文件会让鉴权/重写逻辑误伤 CSS/JS/图片。
   * /theme-assets 必须留在 matcher 内 —— 由 proxy 自己返回文件，Next 没有对应的 route。
   */
  matcher: [
    '/((?!api|_next/static|_next/image|brand|favicon\\.ico|icon\\.svg|apple-icon\\.png).*)'
  ]
}
