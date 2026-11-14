import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { Providers } from '@/components/providers'
import './globals.css'

/**
 * Public Sans 自托管（src/panel/fonts/）。
 *
 * 为什么不用 next/font/google：它在**构建期**要去 fonts.googleapis.com 拉字体，
 * 内网/纯净网络直接构建失败（仓库里曾有过 compose.override.yaml 钉 IP 绕过，
 * 但那是本地 hack，不能让部署者踩）。自托管后构建零外网依赖。
 *
 * 这是一份可变字体，覆盖 400-700 字重；latin 子集已含全部 ASCII，
 * 中文/日文回落到 system-ui（见 globals.css 的 --font-sans 兜底链）。
 */
const sans = localFont({
  src: '../fonts/public-sans-latin.woff2',
  variable: '--font-public-sans',
  display: 'swap',
  weight: '400 700',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif']
})

/**
 * metadata 用 generateMetadata（请求时求值）而不是常量 export。
 *
 * 原因：常量 export 在**构建期**求值，`metadataBase` 会把当时的站点地址固化成
 * 构建产物里的一串字面量。容器里改站点地址（换域名/IPv6 地址）不重新构建就生效不了，
 * OG / Twitter 图片会指向错误的 host。
 */
export async function generateMetadata(): Promise<Metadata> {
  // SITE_URL 不带 NEXT_PUBLIC_ 前缀 → 不会被构建期内联，运行时读取
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  return {
    // 用于解析 OG / Twitter 图片的绝对地址；没有它 Next 只会警告并用 localhost
    metadataBase: new URL(siteUrl),
    title: {
      default: 'Sparrow Panel',
      template: '%s · Sparrow Panel'
    },
    description: '自托管代理服务运营面板：售卖、配额、订阅、节点一体化',
    applicationName: 'Sparrow Panel',
    openGraph: {
      title: 'Sparrow Panel',
      description: '自托管代理服务运营面板：售卖、配额、订阅、节点一体化',
      siteName: 'Sparrow Panel',
      type: 'website',
      locale: 'zh_CN'
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Sparrow Panel',
      description: '自托管代理服务运营面板：售卖、配额、订阅、节点一体化'
    }
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${sans.variable} font-sans antialiased`}>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
