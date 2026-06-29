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

# BASE_URL / APP_URL は build 時にクライアント bundle へインライン化されるため、
# 空のまま build を通すと `http://localhost:3000` 系のローカル URL を sitemap /
# OGP / canonical / breadcrumb に焼き込む silent SEO 汚染を引き起こす。
# 空でかつ末尾スラッシュ無しの絶対 URL であることを Docker layer で early assert する。
# Turnstile / GA は legitimately optional のため未検査。
RUN if [ -z "$NEXT_PUBLIC_BASE_URL" ] || [ -z "$NEXT_PUBLIC_APP_URL" ]; then \
      echo "ERROR: NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL は build 時に必須（cloudbuild trigger で substitution 設定）" >&2; \
      exit 1; \
    fi; \
    case "$NEXT_PUBLIC_BASE_URL" in */) echo "ERROR: NEXT_PUBLIC_BASE_URL に末尾スラッシュ" >&2; exit 1 ;; esac; \
    case "$NEXT_PUBLIC_APP_URL" in */) echo "ERROR: NEXT_PUBLIC_APP_URL に末尾スラッシュ" >&2; exit 1 ;; esac

ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID

# --- Stage 3: Build ---
# 型チェック・lint は CI の独立 required job がフルリポジトリで実施済み
# （Docker context は .dockerignore で e2e/ __tests__ を除外するため、
# tsconfig.test.json の tsc は scripts/e2e → e2e/fixtures を解決できず context 不整合）。
# next build が app の型チェックを内蔵するため、builder は build のみ実行する。
# Cloud Build の Docker RUN は Next.js production compile 中に長時間無出力に
# なることがある。build 自体の挙動は変えず、heartbeat だけを出して Cloud Build
# 側の無出力 internal error とアプリ側 exit code を切り分けやすくする。
FROM builder-base AS builder
RUN --mount=type=secret,id=next_server_actions_encryption_key \
    sh -lc 'export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)"; \
      (while sleep 60; do echo "[cloudbuild] next build still running"; done) & \
      heartbeat_pid="$!"; \
      cleanup() { kill "$heartbeat_pid" 2>/dev/null || true; wait "$heartbeat_pid" 2>/dev/null || true; }; \
      trap cleanup EXIT INT TERM; \
      bun run build; \
      status="$?"; \
      cleanup; \
      trap - EXIT INT TERM; \
      exit "$status"'

# --- Stage 4: Migrator (Cloud Run Job: `prisma migrate deploy`) ---
# slim な runner と違い、Prisma CLI は TypeScript の prisma.config.ts を c12 / jiti /
# deepmerge-ts でロードするため依存一式が必要。これらは @prisma/config / prisma CLI の
# 依存だがトップレベル node_modules に在り、runner の `COPY @prisma` では同梱されない。
# 不完全な node_modules では `bunx` が実行時にパッケージを再ダウンロードし、その不整合
# コンテキストで config ローダ（c12/jiti）が解決できず prisma.config.ts を読めない →
# datasource.url 未解決で migrate deploy が exit(1)。これが OOM(#597) / studio-core
# tarball flake(#598) / config 未ロード(#599) の共通原因。
#
# 対策: migrate を deps ステージ（bun install 済みの完全な node_modules）の上で実行し、
# 実行時の再ダウンロードを構造的に排除する。CI（.github/workflows/ci.yml の
# `bunx --bun prisma migrate deploy`）と同一環境のため確実に config をロードできる。
#
# このステージは runner より前に置き、runner を Dockerfile 末尾（=`--target` 未指定時の
# 既定ビルド対象）に保つ。cloudbuild は両ステージを `--target` で明示選択する
# （build-image→runner / build-migrator→migrator）が、素の `docker build .` でも service
# イメージが出る安全側に倒す。#599 で migrator を末尾に置いたため `--target` 未指定の
# build-image が migrator を service タグでビルドし、service が migrate を実行して exit(0)
# →ポート未待受で起動プローブ失敗、という回帰が起きた。その再発防止。
FROM deps AS migrator
WORKDIR /app
# deps は package.json / bun.lock / prisma/（schema + migrations）/ 完全な node_modules /
# generated を保持済み。root の prisma.config.ts（datasource.url = env("DATABASE_URL")）
# だけ追加で必要。
COPY prisma.config.ts ./
CMD ["bunx", "--bun", "prisma", "migrate", "deploy"]

# --- Stage 5: Runner (Cloud Run service) ---
# Dockerfile 末尾 = `docker build` の既定ターゲット。cloudbuild は `--target=runner` で明示選択。
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
# runner は Cloud Run service 専用。ランタイムは @prisma/client（上でコピー）＋ generated のみ
# 参照し、Prisma CLI（node_modules/prisma）も prisma/ ソース（schema / migrations）も使わない。
# migrate deploy は専用の migrator ステージ（上記 Stage 4・完全な node_modules）が担う。

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
