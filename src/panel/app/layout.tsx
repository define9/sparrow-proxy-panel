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
  title: {
    default: 'Sparrow Panel',
    template: '%s · Sparrow Panel'
  },
  description: '自托管代理服务运营面板'
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
