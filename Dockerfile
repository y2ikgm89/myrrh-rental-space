# syntax=docker.io/docker/dockerfile:1
#
# ビルド・実行とも Bun（package.json の packageManager と一致）
# standalone の server.js は Node API 互換のため Bun でそのまま起動可能
# https://bun.sh/guides/ecosystem/docker

FROM oven/bun:1.3.13-alpine AS base
WORKDIR /app

# --- Stage 1: Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma

# --- Stage 2: Build Prep ---
FROM base AS builder-base
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true

# NEXT_PUBLIC_* はビルド時にクライアント JS へインライン化される。
# ARG はそのままだと宣言ステージ（builder-base）末尾でスコープが切れ、派生する
# builder ステージの `bun run build` に引き継がれない（Docker 公式仕様）。
# ENV はレイヤーに焼かれて派生ステージへ継承されるため ARG→ENV 変換が必須
# （Next.js 公式 Docker パターン）。未変換だとクライアントバンドルに空文字が
# インライン化され、GA / Turnstile が本番で silent failure になる。
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID

ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID

# --- Stage 3: Build ---
FROM builder-base AS builder
RUN --mount=type=secret,id=next_server_actions_encryption_key \
    sh -lc 'export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)"; bun run type-check && bun run lint && bun run build'

# --- Stage 4: Runner ---
FROM base AS runner

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# PORT は Cloud Run が自動注入する（Cloud Run Container Runtime Contract）。
# https://cloud.google.com/run/docs/container-contract#port
# Next.js standalone の server.js は process.env.PORT を読み取るため Dockerfile 側で指定しない。

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# @prisma/client runtime（WASM ランタイムエンジン）
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
# Cloud Run runner で未参照の Prisma client 成果物を削除:
# - PostgreSQL 以外の WASM query_compiler（adapter-pg は postgresql のみ dynamic import）
# - source maps（production で不要）
# - Edge runtime 用 wasm-compiler-edge（Cloud Run + Bun では未参照）
# - Browser stub（runtime/index-browser.* と root の index-browser.js / edge.*）
# - generator-build/（`prisma generate` 専用、runner で未起動）
RUN find ./node_modules/@prisma/client/runtime \
    \( -name 'query_compiler_*.cockroachdb.*' \
    -o -name 'query_compiler_*.mysql.*' \
    -o -name 'query_compiler_*.sqlite.*' \
    -o -name 'query_compiler_*.sqlserver.*' \
    -o -name '*.map' \
    -o -name 'index-browser.*' \
    -o -name 'wasm-compiler-edge.*' \) \
    -delete && \
    rm -rf ./node_modules/@prisma/client/generator-build && \
    rm -f ./node_modules/@prisma/client/edge.js \
          ./node_modules/@prisma/client/edge.d.ts \
          ./node_modules/@prisma/client/index-browser.js
# Prisma CLI + schema / migrations — Cloud Run Job 側で `bunx --bun prisma migrate deploy` を実行するため
# 同一 image を Cloud Run service と migrate Job で共有する（cloudbuild.yaml の migrate-update/execute 参照）。
# standalone trace には `prisma` パッケージが含まれないため明示コピーが必須。
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
