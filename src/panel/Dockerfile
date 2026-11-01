# ---- 基础镜像 ----
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable

# ---- 依赖（利用 layer 缓存）----
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY src/panel/package.json ./src/panel/
# pnpm 10+ 会拦截依赖的安装脚本，pnpm 12 更是把「存在被忽略的构建」直接判为错误。
# 这里显式 --ignore-scripts 安装（不会失败），再只重建构建必需的几个二进制包。
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && (pnpm rebuild esbuild @swc/core @parcel/watcher unrs-resolver \
        || echo "[warn] 部分依赖的构建脚本执行失败，继续构建")

# ---- 构建 ----
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter panel build

# ---- 迁移（一次性任务，用完整依赖）----
FROM deps AS migrator
WORKDIR /app
COPY src/panel/drizzle ./src/panel/drizzle
COPY src/panel/scripts/migrate.mjs ./src/panel/scripts/migrate.mjs
WORKDIR /app/src/panel
CMD ["node", "scripts/migrate.mjs"]

# ---- 运行时（standalone，无 dev 依赖）----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nextjs

COPY --from=builder --chown=nextjs:nodejs /app/src/panel/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/src/panel/.next/static ./src/panel/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/src/panel/public ./src/panel/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/public/status >/dev/null || exit 1

CMD ["node", "src/panel/server.js"]
