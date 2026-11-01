import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  // monorepo：让 standalone 产物把 workspace 依赖一起带上
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: ['@sparrow/contracts']
}

export default withNextIntl(nextConfig)
