import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // 服务层用 `server-only` 保证不被客户端导入；测试里它是空模块
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
      '@': __dirname
    }
  },
  test: {
    include: ['**/*.test.ts'],
    // lib/agent/sign.test.ts 是独立脚本（pnpm test:sign），不是 vitest 套件
    exclude: ['node_modules/**', '.next/**', 'lib/agent/sign.test.ts'],
    environment: 'node'
  }
})
