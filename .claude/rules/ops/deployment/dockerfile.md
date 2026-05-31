---
description: Dockerfile 3-stage build (deps / builder / runner) パターン、Prisma WASM 配置、STANDALONE / NEXT_PUBLIC 注入、Cloud Run probe 統一
paths:
  - Dockerfile
  - .dockerignore
---

# Dockerfile パターン

> 3-stage multi-stage build (deps / builder / runner) + Prisma 7 WASM + STANDALONE + NEXT_PUBLIC ARG + non-root runner。

## 3-stage multi-stage build

```dockerfile
FROM oven/bun:1.3.13-alpine AS base   # 共通ベース（package.json packageManager と一致、Bun 1.3.14 は Lexical TDZ regression のため見送り）
FROM base AS deps                      # 依存 + Prisma generate
FROM base AS builder                   # build のみ（型/lint は CI required job が担保）
FROM base AS runner                    # standalone output + 非root
```

## deps ステージ

```dockerfile
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma
```

**注意**: Prisma 7 の `output = "../generated/prisma"` により、生成物は `generated/prisma/` に出力される（`node_modules/.prisma/` ではない）。

## builder ステージ

```dockerfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated  # 必須
COPY . .
```

**CRITICAL**: `.gitignore` が `generated/` を除外しているため、Cloud Build ソースアップロードにはこのディレクトリが含まれない。deps ステージから明示的にコピーが必要。

## STANDALONE 環境変数 + build 専用 DATABASE_URL

`output: 'standalone'` は `STANDALONE=true` 環境変数で条件付き有効化。builder ステージの `ENV` ブロックで設定:

```dockerfile
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
```

**`DATABASE_URL` は build 専用プレースホルダ**: `prisma.config.ts` の `env("DATABASE_URL")` が config ロード時に eager 解決するため `db:generate` / `next build` に必須。ビルドは DB に接続しない（CI も同一のダミー URL を使用、static 生成は `safeFetch` の fallback で成立）。runner ステージは別 `FROM base` のためこの ENV を継承せず、本番は Cloud Run が Secret Manager から実 URL を注入する。server-only 変数のため client バンドルにも焼き込まれない。

**builder の RUN は `bun run build` のみ**: 型チェック・lint は CI の独立 required job がフルリポジトリ（`.dockerignore` が除外する `e2e/` / `scripts/e2e/` / `__tests__` を含む）で実施済み。Docker context は test 系を除外するため `tsc -p tsconfig.test.json` は `scripts/e2e → e2e/fixtures` を解決できず context 不整合になる。`next build` が app の型チェックを内蔵するため build のみで十分。

```typescript
// next.config.ts
...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
```

**理由**: Windows + Turbopack で standalone コピー時にファイル名の `node:` プロトコルがコロンを含み `EINVAL` エラーになる。ローカル開発では standalone 不要のため Docker ビルド時のみ有効化。

## NEXT*PUBLIC*\* のビルド時注入

Next.js は `NEXT_PUBLIC_*` をビルド時にクライアント JS へインライン化する。Docker ARG で注入:

```dockerfile
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
```

## runner ステージ

ビルド・実行とも **Bun**。`standalone` の `server.js` を `bun server.js` で起動する。

```dockerfile
FROM base AS runner
RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# PORT は書かない — Cloud Run が Container Runtime Contract に基づき自動注入する。
# https://cloud.google.com/run/docs/container-contract#port

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# @prisma/client WASM runtime
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
# Cloud Run runner で未参照の Prisma 成果物を削除（image -64MB / functional risk ゼロ）
RUN find ./node_modules/@prisma/client/runtime \
    \( -name 'query_compiler_*.cockroachdb.*' \
    -o -name 'query_compiler_*.mysql.*' \
    -o -name 'query_compiler_*.sqlite.*' \
    -o -name 'query_compiler_*.sqlserver.*' \
    -o -name '*.map' \
    -o -name 'index-browser.*' \
    -o -name 'wasm-compiler-edge.*' \) -delete && \
    rm -rf ./node_modules/@prisma/client/generator-build && \
    rm -f ./node_modules/@prisma/client/edge.js \
          ./node_modules/@prisma/client/edge.d.ts \
          ./node_modules/@prisma/client/index-browser.js
# Prisma CLI + schema / migrations（Cloud Run Job が同一 image で `bunx --bun prisma migrate deploy` を実行するため必須）
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
```

**注意**: `node_modules/@prisma` は WASM ランタイムエンジン。standalone output には含まれないためコピー必須。

**Cloud Run プローブ**: [公式ドキュメント](https://cloud.google.com/run/docs/configuring/healthchecks) の HTTP プローブを使用。startup-probe / liveness-probe とも `GET /api/live`（DB 非依存の軽量 alive チェック）に統一。`/api/health` は DB 疎通を含む詳細チェックで、監視・手動確認専用（liveness に使わない — DB 一時断でコンテナが連鎖 kill されるため）。
