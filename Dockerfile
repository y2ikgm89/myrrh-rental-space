# syntax=docker.io/docker/dockerfile:1
#
# 依存解決とスクリプト実行は Bun（package.json の packageManager と一致）。
# **`next build` と実行（runner）は Node**。理由は Stage 2 / Stage 5 のコメント。
# https://bun.sh/guides/ecosystem/docker
# https://github.com/vercel/next.js/tree/canary/examples/with-docker

FROM oven/bun:1.4.0-alpine AS base
WORKDIR /app

# --- Stage 1: Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
COPY scripts/bun-ci-install.sh ./scripts/bun-ci-install.sh
# `package.json#prepare` は `bun ci` の直後に走る。ファイルが無いと
# `Module not found "scripts/prepare-lefthook.ts"` で deps 段が落ち、
# Cloud Build が revision を出さない（2026-08-20 Deploy Production）。
COPY scripts/prepare-lefthook.ts ./scripts/prepare-lefthook.ts
RUN sh ./scripts/bun-ci-install.sh && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma

# --- Stage 2: Build Prep ---
FROM base AS builder-base

# `next build` を実 Node で走らせる。
#
# `oven/bun:*-alpine` の `node` は `/usr/local/bun-node-fallback-bin/node` で、実体は
# Bun 本体（実測: `node -e "process.versions.bun"` が 1.4.0 を返す）。`next` の bin は
# `#!/usr/bin/env node` なので、何もしないと **本番 image の build だけ Bun ランタイム**に
# なる。CI は ubuntu の実 Node で build しているため、緑になった build と出荷される
# build が別ランタイムという状態だった。
#
# Bun と Node の差は落ちずに出力だけ変わることがある（#2182: SSR が 200 のまま本文だけ
# 欠けた）。prerender で同じことが起きると build は成功し、壊れた静的 HTML が出荷される。
#
# `/usr/local/bin` は PATH 上で fallback より前なのでこの COPY だけで置き換わる。
# **タグは下の runner ステージと同じものを使う**（バージョンが一致する）。ずれると
# build と実行が別ランタイムになるので、メジャーの一致は
# `__tests__/unit/architecture/deploy-packaging-contract.test.ts` が機械強制する。
COPY --from=node:24.20.0-alpine /usr/local/bin/node /usr/local/bin/node

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true \
    NEXT_DISABLE_TURBOPACK_FS_CACHE=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build

# NEXT_DISABLE_TURBOPACK_FS_CACHE は next.config.ts の kill switch で、Turbopack の
# ファイルシステムキャッシュ (dev / build 両方) を落とす。Docker ビルドでは書いても
# 次回読まれないため切る:
#   - `.dockerignore` が `.next` を除外するので builder は毎回 cold から始まる
#   - runner が builder から拾うのは public / .next/standalone / .next/static だけで
#     `.next/cache` は運ばない
#   - cloudbuild.yaml が push するのは runner / migrate タグで、builder レイヤは出ない
# 公式 (同梱 docs の turbopackFileSystemCache ページ):
#   "If your build environment never preserves `.next/cache`, set
#    `turbopackFileSystemCacheForBuild: false` to skip writing a cache that will not be read."
# 将来 Cloud Build 側で `.next/cache` を持ち回るなら、この 1 行を消すだけで戻る。
# CI (GitHub Actions) は別経路で、`.next/cache` を run 間で保持しているため対象外。

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
      echo "ERROR: NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL は build 時に必須（production workflow / emergency submit で substitution 設定）" >&2; \
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
    sh -lc 'export BETTER_AUTH_SECRET="build-time-better-auth-placeholder-not-runtime-7dS9kL4qQ8mN2vX5rT6yB3cH1pZ0aW"; \
      export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)"; \
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
# deepmerge-ts でロードするため依存一式が必要。runner の `COPY @prisma` だけでは不足。
# 不完全な node_modules では `bunx` が実行時再 DL し、config ローダが解決できず
# migrate deploy が exit(1) になる（過去: OOM / tarball flake / config 未ロード）。
#
# 対策: deps（`scripts/bun-ci-install.sh` = `bun ci`、devDeps 含む）の完全な
# node_modules 上で migrate する。`prisma` CLI は package.json dependencies に置き、
# 将来 deps を `--production` 化しても migrator から外れない契約にする。
#
# このステージは runner より前に置く（末尾 = `docker build` 既定ターゲットを runner に保つ）。
# cloudbuild は `--target=runner` / `--target=migrator` を明示選択する。
FROM deps AS migrator
WORKDIR /app
# deps は package.json / bun.lock / prisma/ / 完全な node_modules / generated を保持済み。
# root の prisma.config.ts（datasource.url = env("DATABASE_URL")）だけ追加で必要。
COPY prisma.config.ts ./
# 適用前の既存行チェック（`scripts/migration-preconditions.ts`）を migrate の**前**に走らせる。
# tsconfig.json は `@generated/*` alias の解決に要る（bun が paths を読む）。
#
# 落ちるなら migrate を始めない、が要点。始めてから落ちると `_prisma_migrations` に
# 失敗が記録され、以降のデプロイが全部ブロックされて復旧が本番 DB の手作業になる。
COPY tsconfig.json ./
COPY scripts/migration-preconditions.ts ./scripts/migration-preconditions.ts
CMD ["sh", "-c", "bun scripts/migration-preconditions.ts && bunx --bun prisma migrate deploy"]

# --- Stage 5: Runner (Cloud Run service) ---
# Dockerfile 末尾 = `docker build` の既定ターゲット。cloudbuild は `--target=runner` で明示選択。
#
# **runner を Node で動かす**。`next build` も Stage 2 の `COPY --from=node:...` で
# 実 Node にしてある（ADR 0005: Next サーバーの実行と `next build` は Node、
# 依存解決とスクリプトは Bun）。理由は 2 つ。
#
# 1. Next.js が前提にしているのは Node で、公式 with-docker の例も node:alpine。
#    standalone の `server.js` は Next 自身の Node サーバーなのでそのまま動く。
# 2. Bun で動かすと jsdom を読む経路が必ず落ちる。Next の `require-hook` が
#    `Module._resolveFilename` を差し替えた状態の Bun では、ESM 内の
#    `createRequire(import.meta.url)` 由来 require が `parent === undefined` で渡り、
#    `css-tree/lib/data-patch.js` の `require('../data/patch.json')` が
#    `Cannot find module '../data/patch.json' from ''` で失敗する
#    （Bun 既知未修正 https://github.com/oven-sh/bun/issues/13076）。
#    公開ページの本文が SSR HTML から消え、admin の Lexical 保存が例外になっていた。
#
# **`oven/bun` を base にしたまま `CMD ["node", ...]` にしても直らない。** あのイメージの
# `/usr/local/bun-node-fallback-bin/node` は bun 本体への symlink で、`node` と書いても
# Bun が動く。ランタイムを変えるには base image を変えるしかない。
#
# CI（GitHub Actions）は実 Node を持つので `bun run start` → `next start` が Node で走る。
# つまり従来は CI=Node / 本番=Bun という食い違いがあり、それがこの欠陥を隠していた。
# runner を Node にすると E2E と本番のランタイムが一致する。
FROM node:24.20.0-alpine AS runner
WORKDIR /app

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
# Next.js official with-docker: non-root user が ISR / prerender cache を書けるよう
# .next を先に用意して chown する（standalone COPY だけでは不足）。
# https://github.com/vercel/next.js/tree/canary/examples/with-docker
RUN mkdir -p .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma runtime は standalone のトレースが既に含んでいる。**node_modules を手で
# 足さない。** Next.js 公式は standalone を「node_modules を入れずにそれ単体で
# デプロイできるもの」と定義しており、取りこぼしがあるときの公式の直し方も
# `outputFileTracingIncludes` であって Dockerfile の COPY ではない。
#
# 実測（Prisma 7.9.1 / adapter-pg / moduleFormat cjs）: `.next/standalone/node_modules/@prisma`
# には client（package.json + runtime/client.js + query_compiler_fast_bg.postgresql の
# .js と .wasm-base64.js）と client-runtime-utils だけが入る = 5MB。生成 client の
# dynamic import は 3 つとも**文字列リテラル**なので nft が追える。adapter-pg 側は
# server bundle に取り込まれ、その `require("pg")` の先だけがトレースされる。
#
# 以前はここで `node_modules/@prisma` を丸ごと COPY してから未参照ファイルを
# `rm` していたが、(1) CLI 専用の studio-core / engines / dev 等 95MB を持ち込み、
# (2) レイヤーは加算なので後段の `rm` は image を 1 バイトも縮めていなかった
# （COPY レイヤー 179MB に対し prune レイヤーは 24.6kB の whiteout のみ）。
#
# 下の `test -f` は「トレースが落ちたら image を出荷せずビルドを fail させる」ガード。
# **拡張子は schema.prisma の `moduleFormat` に従属する**（generator が
# cjs → `.js` / esm → `.mjs` を specifier に焼き込む）。現在は cjs なので `.js` を検査する。
# 整合は __tests__/unit/architecture/prisma-client-module-format.test.ts が機械照合する。
RUN test -f ./node_modules/@prisma/client/runtime/client.js && \
    test -f ./node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.js && \
    test -f ./node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js
# runner は Cloud Run service 専用。Prisma CLI（node_modules/prisma）も prisma/ ソース
# （schema / migrations）も使わない。
# migrate deploy は専用の migrator ステージ（上記 Stage 4・完全な node_modules）が担う。

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
