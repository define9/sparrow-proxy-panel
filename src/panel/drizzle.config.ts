import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    // 迁移用 DATABASE_URL；服务端运行时用 NUXT_DATABASE_URL，两者等价
    url: process.env.DATABASE_URL
      ?? process.env.NUXT_DATABASE_URL
      ?? 'postgresql://sparrow:dev@localhost:5432/sparrow'
  },
  strict: true,
  verbose: true
})
