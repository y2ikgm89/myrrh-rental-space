# Docker設定ガイド

> Next.js 16 + Bun 1.3.x + Prisma 7 WASM の本番 Docker 構成。
> デプロイ手順は [`deployment.md`](./deployment.md)、詳細ルールは [`.claude/rules/deployment-patterns.md`](../../.claude/rules/deployment-patterns.md) を参照。

---

## ファイル構成

```
myrrh-rental-space/
├── Dockerfile          # 本番ビルド用（3-stage multi-stage）
├── docker-compose.yml  # ローカル開発用（PostgreSQL）
├── .dockerignore       # Docker ビルドコンテキスト除外
├── .gcloudignore       # Cloud Build ソースアップロード除外
└── cloudbuild.yaml     # Cloud Build + Cloud Run deploy
```

---

## Dockerfile

### アーキテクチャ

3-stage multi-stage build。共通 `base` ステージで DRY:

```
base (oven/bun:1.3.9-alpine)
├── deps     → 依存インストール + Prisma generate
├── builder  → validate + build（standalone output）
└── runner   → 最小限の本番実行環境（非root）
```

### 実際の Dockerfile

```dockerfile
# syntax=docker.io/docker/dockerfile:1

FROM oven/bun:1.3.9-alpine AS base
WORKDIR /app

# --- Stage 1: Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma

# --- Stage 2: Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/shared/generated ./src/shared/generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true

# NEXT_PUBLIC_* はビルド時にクライアント JS へインライン化される
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID

RUN bun run validate && bun run build

# --- Stage 3: Runner ---
FROM base AS runner

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
```

### 設計のポイント

| 項目 | 詳細 |
|------|------|
| **ベースイメージ** | `oven/bun:1.3.9-alpine`（軽量 + `base` ステージで共有） |
| **libc6-compat** | bcrypt 等のネイティブモジュール互換に必要。deps + runner の両方 |
| **Prisma generate** | deps ステージで実行。出力先: `src/shared/generated/prisma/` |
| **generated コピー** | `.gitignore` で除外 → Cloud Build に含まれない → `COPY --from=deps` 必須 |
| **STANDALONE** | `ENV STANDALONE=true` で `output: 'standalone'` を条件付き有効化 |
| **validate** | builder で `bun run validate`（type-check + lint）を実行してからビルド |
| **NEXT_PUBLIC_*** | Docker ARG でビルド時注入（クライアント JS インライン化） |
| **Prisma WASM** | `node_modules/@prisma`（WASM ランタイムエンジン）を runner にコピー |
| **ポート** | 8080（Cloud Run 標準） |
| **起動コマンド** | `bun server.js`（standalone の server.js を直接実行） |
| **非root** | `adduser --system nextjs` + `USER nextjs` |

### なぜ STANDALONE 環境変数が必要か

Windows + Turbopack でファイル名の `node:` プロトコルがコロンを含み `EINVAL` エラーになるため、ローカル開発では standalone を無効化。Docker ビルド時のみ `STANDALONE=true` で有効化:

```typescript
// next.config.ts
...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
```

---

## docker-compose.yml

ローカル開発用。PostgreSQL のみ Docker で起動し、アプリケーションはホストで実行:

```bash
# PostgreSQL 起動
docker compose up -d db

# マイグレーション
bunx --bun prisma migrate dev --name <name>

# 開発サーバー（ホスト側）
bun dev

# 停止
docker compose stop db

# データも削除
docker compose down -v
```

---

## .dockerignore

Docker ビルドコンテキストから除外するファイル。`src/shared/generated` を含む（deps ステージで再生成するため）:

```
node_modules
.next
src/shared/generated
.git
.env
.env.*
docs/
*.md
__tests__
e2e/
.claude/
.serena/
.agents/
```

---

## トラブルシューティング

### Prisma クライアントが見つからない

runner ステージで `node_modules/@prisma` のコピーが漏れている。WASM ランタイムエンジンが必要:

```dockerfile
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
```

### generated ディレクトリが空

`.gitignore` で `src/shared/generated/` が除外されているため Cloud Build ソースに含まれない。builder ステージで deps からコピー:

```dockerfile
COPY --from=deps /app/src/shared/generated ./src/shared/generated
```

### NEXT_PUBLIC_* がクライアントで undefined

ビルド時に Docker ARG で注入が必要。ランタイム env var のみではクライアント JS にインライン化されない:

```yaml
# cloudbuild.yaml
- --build-arg=NEXT_PUBLIC_BASE_URL=https://example.com
```

---

## 参考

- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Bun Docker Guide](https://bun.sh/guides/ecosystem/docker)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [`.claude/rules/deployment-patterns.md`](../../.claude/rules/deployment-patterns.md) - 詳細ルール

---

最終更新: 2026-02-18
