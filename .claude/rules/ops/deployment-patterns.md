---
paths:
  - Dockerfile
  - cloudbuild.yaml
  - .dockerignore
  - .gcloudignore
  - docs/operations/**
---

# デプロイパターンルール

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
FROM oven/bun:1.3.12-alpine AS base   # 共通ベース（package.json packageManager と一致）
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
    HOSTNAME=0.0.0.0

# PORT は書かない — Cloud Run が Container Runtime Contract に基づき自動注入する。
# https://cloud.google.com/run/docs/container-contract#port

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# @prisma/client WASM runtime
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
# Prisma CLI + schema / migrations（Cloud Run Job が同一 image で `bunx --bun prisma migrate deploy` を実行するため必須）
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
```

**注意**: `node_modules/@prisma` は WASM ランタイムエンジン。standalone output には含まれないためコピー必須。

**Cloud Run プローブ**: [公式ドキュメント](https://cloud.google.com/run/docs/configuring/healthchecks) の HTTP プローブを使用。startup-probe / liveness-probe とも `GET /api/live`（DB 非依存の軽量 alive チェック）に統一。`/api/health` は DB 疎通を含む詳細チェックで、監視・手動確認専用（liveness に使わない — DB 一時断でコンテナが連鎖 kill されるため）。

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
- --update-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,DATABASE_POOL_MAX=${_DATABASE_POOL_MAX},...,BETTER_AUTH_URL=${_BETTER_AUTH_URL}
```

| 変数                      | 用途                                                    |
| ------------------------- | ------------------------------------------------------- |
| `BETTER_AUTH_URL`         | Better Auth のベース URL（ランタイムのみ）              |
| `NODE_ENV`                | production 設定                                         |
| `NEXT_TELEMETRY_DISABLED` | Next.js テレメトリー無効化                              |
| `DATABASE_POOL_MAX`       | pg Pool 最大接続数（Cloud Run 1 vCPU 想定で `10` 推奨） |

### Cloud Run runtime 設定（公式ベストプラクティス準拠）

| 設定                      | 値 / 例                                                                    | 根拠                                                                                           |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--service-account`       | dedicated SA（Compute default SA 禁止）                                    | [最小権限原則](https://cloud.google.com/run/docs/configuring/service-accounts)                 |
| `--execution-environment` | `gen2`                                                                     | 公式推奨（syscall 互換性・ストレージ）                                                         |
| `--cpu-boost`             | 有効                                                                       | Cold Start 高速化                                                                              |
| `--no-cpu-throttling`     | 有効（CPU always-allocated）                                               | [fireAndForget / after() 安定化](https://cloud.google.com/run/docs/configuring/cpu-allocation) |
| `--port`                  | `8080`                                                                     | Cloud Run container port（Container Runtime Contract）                                         |
| `--startup-probe`         | `httpGet.path=/api/live,port=8080,failureThreshold=9,periodSeconds=10`     | DB 非依存の軽量 alive チェック                                                                 |
| `--liveness-probe`        | `httpGet.path=/api/live,port=8080,initialDelaySeconds=10,periodSeconds=30` | `/api/health`（DB 依存）禁止                                                                   |

### Prisma migrate Cloud Run Job（cloudbuild.yaml 組込）

schema commit と migration 適用の drift を防ぐため、deploy 前に migrate Job を実行する:

```yaml
# Step N-1: migrate Job の image を新 SHA に更新
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: migrate-update
  entrypoint: gcloud
  args:
    - run
    - jobs
    - update
    - ${_MIGRATE_JOB_NAME}
    - --region=${_REGION}
    - --image=${_AR_HOST}/${PROJECT_ID}/${_REPOSITORY}/${_SERVICE_NAME}:${SHORT_SHA}

# Step N: migrate 実行（--wait で完了待機、fail 時はデプロイ全体停止）
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: migrate-execute
  entrypoint: gcloud
  args: [run, jobs, execute, ${_MIGRATE_JOB_NAME}, --region=${_REGION}, --wait]
```

**初回のみ**: Job の作成は手動で行う（`gcloud run jobs create prisma-migrate --command bunx --args --bun,prisma,migrate,deploy ...`）。手順は `docs/operations/deployment.md` §6。

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

Prisma マイグレーションは cloudbuild.yaml 内の `prisma-migrate` Cloud Run Job で自動実行される（schema と DB の drift 防止）。手動実行は緊急時のみ:

```bash
gcloud run jobs execute prisma-migrate --region asia-northeast1 --wait
```

初回の Job 作成は `docs/operations/deployment.md` §6 を参照。

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

9. **Dockerfile で `ENV PORT=...` を書かない**
   - Cloud Run Container Runtime Contract が PORT を自動注入する
   - hardcode すると `gcloud run deploy --port=<N>` の override が silent に壊れる
   - `HOSTNAME=0.0.0.0` のみ保持（Next.js standalone が listen address として読む）

10. **Cloud Run デプロイで `--service-account` 省略禁止**
    - デフォルトは Compute Engine default SA（広範な権限 = 最小権限原則違反）
    - dedicated SA を作成して `_SERVICE_ACCOUNT` substitution 必須

11. **liveness-probe に `/api/health` を指定禁止**
    - `/api/health` は DB 疎通を含むため、DB 一時断でコンテナが連鎖 kill される
    - liveness は `/api/live`（DB 非依存）を使う。`/api/health` は監視・手動確認用

12. **Cloud Run `--cpu-throttling`（default）で `fireAndForget` を使うと副作用が切られる**
    - request 返却後に CPU が即座に停止し、メール送信・通知生成・カレンダー同期が midway で中断
    - `--no-cpu-throttling`（CPU always-allocated）を指定する（コスト影響あり、公式推奨）

13. **schema.prisma 変更を含むコミットのデプロイで migrate Job 実行を飛ばさない**
    - cloudbuild.yaml の `migrate-update` → `migrate-execute` を deploy step の `waitFor` に入れる
    - 飛ばすと schema と DB の drift で production の P2021（table not found）等の runtime エラー

14. **`validateProductionEnv()` に `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL` 必須チェック維持**
    - Cloud Build substitution で未指定だと `""` でビルドされ silent failure
    - `instrumentation.register()` で fail-fast（起動時 throw）

15. **Cloud Run probe endpoint (`/api/live`, `/api/health`) を `proxy.ts` の rate-limit 対象から外す**
    - Cloud Run probe は `x-forwarded-for` 未設定 → `getClientIp()` が `"unknown"` を返し全 probe が同一 bucket に合算
    - burst 時に `apiRateLimiter` (100/min) を超過 → 429 → liveness 失敗 → コンテナ kill 連鎖
    - `proxy.ts` の `/api/webhooks` / `/api/cron` 早期リターンと同列に probe も除外する

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
