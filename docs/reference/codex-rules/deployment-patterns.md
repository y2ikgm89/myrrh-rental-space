---
paths:
  - Dockerfile
  - cloudbuild.yaml
  - .dockerignore
  - .gcloudignore
  - docs/operations/**
---

# デプロイパターンルール

> Codex 用参照ドキュメント。デプロイ関連ファイルのルールはこのファイルを正本とする。
> Docker / Cloud Run / Cloud Build / Artifact Registry対応

## アーキテクチャ概要

Cloud Run (Gen2) + Artifact Registry + Cloud Build によるデプロイ。
Bun ランタイム + Prisma 7 WASM エンジン。

| コンポーネント     | 技術                                                       |
| ------------------ | ---------------------------------------------------------- |
| コンテナランタイム | Bun 1.3.x（Cold Start 高速）                               |
| Prisma エンジン    | `engineType = "client"` + `runtime = "bun"`（WASM ベース） |
| Docker ビルド      | 3-stage multi-stage（deps → builder → runner）             |
| キャッシュ         | BuildKit + BUILDKIT_INLINE_CACHE                           |
| CI/CD              | Cloud Build → Artifact Registry → Cloud Run                |

## Dockerfile パターン

### 3-stage multi-stage build

```dockerfile
FROM oven/bun:1.3.9-alpine AS base    # 共通ベース（DRY）
FROM base AS deps                      # 依存 + Prisma generate
FROM base AS builder                   # validate + build
FROM base AS runner                    # standalone output + 非root
```

### deps ステージ

```dockerfile
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma
```

**注意**: Prisma 7 の `output = "../generated/prisma"` により、生成物は `generated/prisma/` に出力される（`node_modules/.prisma/` ではない）。

### builder ステージ

```dockerfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated  # 必須
COPY . .
```

**CRITICAL**: `.gitignore` が `generated/` を除外しているため、Cloud Build ソースアップロードにはこのディレクトリが含まれない。deps ステージから明示的にコピーが必要。

### STANDALONE 環境変数

`output: 'standalone'` は `STANDALONE=true` 環境変数で条件付き有効化。builder ステージの `ENV` ブロックで設定:

```dockerfile
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true
```

```typescript
// next.config.ts
...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
```

**理由**: Windows + Turbopack で standalone コピー時にファイル名の `node:` プロトコルがコロンを含み `EINVAL` エラーになる。ローカル開発では standalone 不要のため Docker ビルド時のみ有効化。

### NEXT*PUBLIC*\* のビルド時注入

Next.js は `NEXT_PUBLIC_*` をビルド時にクライアント JS へインライン化する。Docker ARG で注入:

```dockerfile
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
```

### runner ステージ

ビルド・実行とも **Bun**。`standalone` の `server.js` を `bun server.js` で起動する。

```dockerfile
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

**注意**: `node_modules/@prisma` は WASM ランタイムエンジン。standalone output には含まれないためコピー必須。

**Cloud Run スタートアップ**: [公式ドキュメント](https://cloud.google.com/run/docs/configuring/healthchecks) の **TCP プローブ**（`tcpSocket.port=8080`）でリッスン確認。DB 疎通は `GET /api/health` を監視・手動確認に使う。

## Cloud Build パターン

### Docker レイヤーキャッシュ

```yaml
options:
  env:
    - DOCKER_BUILDKIT=1

steps:
  # キャッシュイメージ pull（初回は skip）
  - name: gcr.io/cloud-builders/docker
    entrypoint: bash
    args: [-c, "docker pull .../:cache || true"]

  # ビルド（キャッシュ利用 + インラインキャッシュ埋め込み）
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg=BUILDKIT_INLINE_CACHE=1
      - --cache-from=.../:cache
      - -t=.../:${SHORT_SHA}
      - -t=.../:cache
      - .
```

### --update-secrets / --update-env-vars

Cloud Run デプロイでは `--update-*`（マージ）を使用。`--set-*`（全置換）は禁止:

```yaml
# OK: 既存の手動追加シークレットを保持
- --update-secrets=DATABASE_URL=DATABASE_URL:${_VERSION}
- --update-env-vars=NODE_ENV=production,...

# NG: 手動追加の任意シークレットが消える
- --set-secrets=DATABASE_URL=DATABASE_URL:${_VERSION}
- --set-env-vars=NODE_ENV=production,...
```

### NEXT*PUBLIC*\* の二重注入

`NEXT_PUBLIC_*` はビルド時（Docker ARG）とランタイム（Cloud Run env var）の両方で必要:

| 用途       | 注入方法            | 理由                                      |
| ---------- | ------------------- | ----------------------------------------- |
| ビルド時   | `--build-arg`       | クライアント JS へインライン化            |
| ランタイム | `--update-env-vars` | Server Components / Server Actions で使用 |

### サーバー専用環境変数

`NEXT_PUBLIC_*` 以外のサーバー側 env var はランタイムのみ注入（ビルド時は不要）:

```yaml
# cloudbuild.yaml — deploy ステップ
- --update-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,...,BETTER_AUTH_URL=${_BETTER_AUTH_URL}
```

| 変数                      | 用途                                       |
| ------------------------- | ------------------------------------------ |
| `BETTER_AUTH_URL`         | Better Auth のベース URL（ランタイムのみ） |
| `NODE_ENV`                | production 設定                            |
| `NEXT_TELEMETRY_DISABLED` | Next.js テレメトリー無効化                 |

### シークレットバージョン固定

Cloud Run シークレットは固定バージョンで参照（`latest` 禁止）:

```yaml
substitutions:
  _DATABASE_URL_SECRET_VERSION: '1'    # 固定バージョン

# deploy ステップ
- --update-secrets=DATABASE_URL=DATABASE_URL:${_DATABASE_URL_SECRET_VERSION}
```

## .dockerignore / .gcloudignore パターン

### .dockerignore

Docker ビルドコンテキストから除外。**`generated` を含める**（deps ステージで再生成するため）:

```
node_modules
.next
generated    # deps ステージで再生成
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

### .gcloudignore

Cloud Build ソースアップロードから除外。`#!include:.gitignore` で .gitignore を継承:

```
#!include:.gitignore
docs/
__tests__/
e2e/
.claude/
.serena/
.agents/
*.md
*.log
```

## シークレット管理

### 必須シークレット（cloudbuild.yaml で管理）

| シークレット         | 用途                          |
| -------------------- | ----------------------------- |
| `DATABASE_URL`       | PostgreSQL 接続               |
| `BETTER_AUTH_SECRET` | Better Auth 署名キー          |
| `ENCRYPTION_KEY`     | API キー暗号化 (64 hex chars) |
| `CRON_SECRET`        | CRON エンドポイント認証       |
| `ADMIN_LOGIN_TOKEN`  | 管理画面アクセス制限          |

### 任意シークレット（手動追加）

`gcloud run services update --update-secrets` で手動追加。デプロイで上書きされない:

```bash
gcloud run services update myrrh-rental-space \
  --region asia-northeast1 \
  --update-secrets=RESEND_API_KEY=RESEND_API_KEY:1
```

| シークレット                                | 用途          |
| ------------------------------------------- | ------------- |
| `RESEND_API_KEY`                            | メール送信    |
| `TURNSTILE_SECRET_KEY`                      | CAPTCHA       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth  |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram API |

## マイグレーション

Prisma マイグレーションは Cloud Run Job で実行:

```bash
gcloud run jobs execute prisma-migrate --region asia-northeast1 --wait
```

## 禁止事項

1. **`--set-secrets` / `--set-env-vars` 禁止**
   - 手動追加の任意シークレット/環境変数が消える
   - `--update-secrets` / `--update-env-vars` を使用

2. **`openssl` パッケージ禁止**
   - Prisma 7 `engineType = "client"` は WASM ベース。OpenSSL 不要
   - `libc6-compat` のみ必要（bcrypt 等のネイティブモジュール互換）

3. **`node_modules/.prisma` コピー禁止**
   - Prisma 7 カスタム output では `node_modules/.prisma/` は空
   - `node_modules/@prisma` をコピー（WASM ランタイムエンジン）

   ```dockerfile
   # NG: Prisma 7 WASM では .prisma/ は空
   COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

   # OK: WASM ランタイムは @prisma/ にある
   COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
   ```

4. **`NEXT_PUBLIC_*` のランタイムのみ注入禁止**
   - ビルド時 Docker ARG が必須（クライアント JS へのインライン化）
   - ランタイム env var のみではクライアント側で `undefined` になる

5. **シークレットバージョン `latest` 禁止**
   - 固定バージョン番号を使用（cloudbuild.yaml の substitutions で管理）

6. **Docker ビルド内での `bun install` 二重実行禁止**
   - deps ステージでのみ `bun install`。builder は `COPY --from=deps` で取得

7. **`generated` の builder COPY 漏れ禁止**
   - `.gitignore` で除外されているため Cloud Build に含まれない
   - `COPY --from=deps /app/generated ./generated` が必須

   ```dockerfile
   # NG: .gitignore で除外されているため Cloud Build に含まれない → ビルドエラー
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .  # ← generated/ が存在しない

   # OK: deps ステージから明示的にコピー
   COPY --from=deps /app/node_modules ./node_modules
   COPY --from=deps /app/generated ./generated
   COPY . .
   ```

8. **root ユーザーでの実行禁止**
   - `adduser --system nextjs` + `USER nextjs` で非 root 実行

## ファイル配置

| パス                            | 内容                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `Dockerfile`                    | multi-stage（deps / builder-base / builder / runner） |
| `cloudbuild.yaml`               | Cloud Build + Cloud Run deploy                        |
| `.dockerignore`                 | Docker ビルドコンテキスト除外                         |
| `.gcloudignore`                 | Cloud Build ソースアップロード除外                    |
| `docs/operations/deployment.md` | デプロイ手順・IAM・シークレット管理                   |
| `src/shared/lib/env/server.ts`  | サーバー環境変数定義                                  |
| `src/shared/lib/env/client.ts`  | クライアント環境変数定義（NEXT*PUBLIC*\*）            |

## 参考

- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud Build Docs](https://cloud.google.com/build/docs)
- [Prisma 7 Client Engine](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/client-engine)
