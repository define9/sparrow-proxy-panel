-- +drizzle-enum
-- 枚举加值必须在事务外执行（PG 12+ 限制），scripts/migrate.mjs 会识别本标记。
ALTER TYPE "public"."plugin_type" ADD VALUE IF NOT EXISTS 'theme';
