import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'spx_session'

/**
 * 只做快速路径：没有会话 cookie 就跳登录。
 * 真正的鉴权在 layout（requireSession）与 route handler（requireApiSession）里查库。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPrivate = /^\/(dashboard|admin)(\/|$)/.test(pathname)

  if (isPrivate && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*']
}
