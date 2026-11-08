import type { Metadata } from 'next'
import { Public_Sans } from 'next/font/google'
import { getLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { Providers } from '@/components/providers'
import './globals.css'

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap'
})

export const metadata: Metadata = {
  // 用于解析 OG / Twitter 图片的绝对地址；没有它 Next 只会警告并用 localhost
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
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
