/**
 * 站点对外地址（origin）。
 *
 * ## 为什么不能在客户端组件里读 NEXT_PUBLIC_SITE_URL
 *
 * `NEXT_PUBLIC_*` 会被 Next 在**构建期**内联进 bundle（客户端和服务端都内联）。
 * 容器里 `NEXT_PUBLIC_SITE_URL` 是运行时环境变量，构建时并不存在 → 拿到的永远是
 * 构建期的兜底值（`http://localhost:3000`）。后果很隐蔽：
 *
 *   - 订阅链接显示成 `http://localhost:3000/sub/xxx`，用户复制到手机上是废链接
 *   - 改环境变量完全无效，必须重新构建镜像才生效
 *
 * 所以这里的规则是：
 *   - **客户端**：用浏览器当前 origin（用户访问的就是对外地址，不存在第二个答案）
 *   - **服务端**：用**不带 NEXT_PUBLIC_ 前缀**的运行时变量 SITE_URL
 *     （非 NEXT_PUBLIC_ 的变量不会被构建期内联，运行时才读取）
 *
 * 环境变量优先级（SITE_URL > NEXT_PUBLIC_SITE_URL）：
 *   - SITE_URL：只在服务端生效，不参与构建期内联，改了立即生效
 *   - NEXT_PUBLIC_SITE_URL：保留兼容，但只作为「构建期就确定」的场景使用
 */

const FALLBACK_ORIGIN = 'http://localhost:3000'

/** 去掉结尾斜杠 */
function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * 站点 origin。
 *
 * 服务端：SITE_URL ?? NEXT_PUBLIC_SITE_URL ?? 兜底
 * 客户端：window.location.origin（NEXT_PUBLIC_* 在这里已被内联，不可信）
 */
export function siteOrigin(): string {
  // 浏览器：用户实际访问的地址（含协议；IPv6 自带方括号，window.location.origin 保证格式正确）
  if (typeof window !== 'undefined') {
    const { origin } = window.location
    if (origin && origin !== 'null') return trimSlash(origin)
  }

  // 服务端：SITE_URL 不带 NEXT_PUBLIC_ 前缀 → 不会被构建期内联，运行时读取
  const runtime = process.env.SITE_URL?.trim()
  if (runtime) return trimSlash(runtime)

  // 兜底（构建期被内联的值，仅在没配 SITE_URL 时用）
  const inlined = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (inlined) return trimSlash(inlined)

  return FALLBACK_ORIGIN
}

/** 同源绝对路径：客户端优先用浏览器 origin（见 siteOrigin 的说明） */
export function siteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteOrigin()}${normalized}`
}
