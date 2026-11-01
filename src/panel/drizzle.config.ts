import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://sparrow:dev@127.0.0.1:5432/sparrow'
  },
  casing: 'snake_case',
  verbose: true,
  strict: true
})
