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
COPY scripts/bun-ci-install.sh ./scripts/bun-ci-install.sh
RUN sh ./scripts/bun-ci-install.sh && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma

# --- Stage 2: Build Prep ---
FROM base AS builder-base
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true \
    DATABASE_URL=postgresql://build:build@localhost:5432/build

# DATABASE_URL は build 専用プレースホルダ。prisma.config.ts の env("DATABASE_URL") が
# config ロード時に eager 解決するため db:generate / next build に必須だが、ビルドは
# DB に接続しない（CI も同一のダミー URL を使用）。runner ステージは別 FROM のため
# この ENV を継承せず、本番は Cloud Run が Secret Manager から実 URL を注入する。
# server-only 変数のため client バンドルにもインライン化されない。

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
# 型チェック・lint は CI の独立 required job がフルリポジトリで実施済み
# （Docker context は .dockerignore で e2e/ __tests__ を除外するため、
# tsconfig.test.json の tsc は scripts/e2e → e2e/fixtures を解決できず context 不整合）。
# next build が app の型チェックを内蔵するため、builder は build のみ実行する。
FROM builder-base AS builder
RUN --mount=type=secret,id=next_server_actions_encryption_key \
    sh -lc 'export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)"; bun run build'

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
#
# prune は Prisma 内部の runtime ファイル名（無保証・minor bump で変わりうる）に依存する。
# 末尾の `test -f` で、生成 client が dynamic import する postgresql query_compiler の存在を
# ビルド時に保証する。将来 Prisma がレイアウトを変えて必要ファイルが消えた場合、silent に
# 壊れた image を出荷せず**ビルドを fail**させて顕在化させるためのガード。
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
          ./node_modules/@prisma/client/index-browser.js && \
    test -f ./node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs && \
    test -f ./node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs
# Prisma CLI + schema / migrations — Cloud Run Job 側で `bunx --bun prisma migrate deploy` を実行するため
# 同一 image を Cloud Run service と migrate Job で共有する（cloudbuild.yaml の migrate-update/execute 参照）。
# standalone trace には `prisma` パッケージが含まれないため明示コピーが必須。
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
