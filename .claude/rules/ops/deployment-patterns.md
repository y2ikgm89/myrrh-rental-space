---
paths:
  - Dockerfile
  - cloudbuild.yaml
  - .dockerignore
  - .gcloudignore
  - docs/how-to/deploy.md
  - docs/how-to/docker.md
  - docs/how-to/cloudflare.md
  - docs/how-to/cron-schedule.md
  - src/**
  - .github/workflows/**
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

**初回のみ**: Job の作成は手動で行う（`gcloud run jobs create prisma-migrate --command bunx --args --bun,prisma,migrate,deploy ...`）。手順は `docs/how-to/deploy.md` §6。

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

初回の Job 作成は `docs/how-to/deploy.md` §6 を参照。

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

| パス                           | 内容                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `Dockerfile`                   | multi-stage（deps / builder-base / builder / runner） |
| `cloudbuild.yaml`              | Cloud Build + Cloud Run deploy                        |
| `.dockerignore`                | Docker ビルドコンテキスト除外                         |
| `.gcloudignore`                | Cloud Build ソースアップロード除外                    |
| `docs/how-to/deploy.md`        | デプロイ手順・IAM・シークレット管理                   |
| `src/shared/lib/env/server.ts` | サーバー環境変数定義                                  |
| `src/shared/lib/env/client.ts` | クライアント環境変数定義（NEXT*PUBLIC*\*）            |

## 参考

- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud Build Docs](https://cloud.google.com/build/docs)
- [Prisma 7 Client Engine](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/client-engine)

## Gotchas

### デプロイ / ビルド / Git / Worktree / Tailwind+Turbopack

### デプロイ

- **`/api/health` で内部インフラ状態（DB 接続状態、バージョン等）を公開しない** — Cloud Run / LB のヘルスチェックには `status` + `timestamp` のみ返す。`database: "connected"/"disconnected"` のようなフィールドは攻撃者のインフラ偵察に利用される
- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **Docker / 秘密未注入のビルドは `bun run build:skip-env`**（`SKIP_ENV_VALIDATION=true`）— `DATABASE_URL` / `BETTER_AUTH_SECRET` がビルド時に無い場合。本番相当は Secret Manager でビルド時に注入し **`bun run build`**（`@t3-oss/env-nextjs` 検証を通す）
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は本番で `CRON_SECRET` 未設定時に 401 を返す。開発環境のみ認証スキップ。staging は明示設定が必要
- **新規 cron route 作成は `scripts/setup-cloud-scheduler.sh` 登録とセット** — route だけ作って Scheduler 登録を忘れると production で発火しない（CI で検出不可）。feature 完了前に `grep <route-name> scripts/setup-cloud-scheduler.sh` でジョブ存在を確認。staging / production デプロイ後に `gcloud scheduler jobs list` でも検証
- **Summary 通知を生成する cron は `hasRecentNotificationOfType` で重複抑制必須** — Cloud Scheduler retry / 手動再実行 / schedule 調整後の重なり走行で同 type の通知が量産される。`src/shared/domain/notifications/commands.ts` の `hasRecentNotificationOfType(type, withinDays)` を cron 冒頭で呼び、true なら `jsonSuccess({ skipped: true, reason: "recent_notification" })` で no-op。`withinDays` は schedule 間隔より 1 日短く（週次 → 6 日）。参照実装: `src/app/api/cron/faq-stale-check/route.ts`
- **Summary 通知は `resourceId` を指定しない** — 個別リソースに紐づかない集約通知（`FAQ_STALE` 等）で `createNotificationCommand` に `resourceType: "xxx"` だけ渡すと dangling になる。代わりに `getNotificationResourceHref(type, resourceType, resourceId)` が第 1 引数 `type` を見て `/admin/faq` 等の集約ビューへルーティングする。`resourceType`/`resourceId` は両方 null にすること
- **`DEFAULT_ROBOTS_TXT` のディレクティブに Tabler Icons プレフィックスが混入していた** — `IconUser-agent` → `User-agent` に修正済み。テンプレートリテラル内の平文テキストに IDE 自動補完でアイコン名が混入するパターン。robots.txt 変更後は `curl -s $URL/robots.txt | head -20` で確認

### ビルド・検証

- **bun:test 環境で `'use cache'` + `cacheLife()` が route handler テスト経由で 500** — `Error: cacheLife() is only available with the cacheComponents config.`（Next.js 16 `'use cache'` の dev 制約）。`next.config.ts` の `cacheComponents: true` が bunfig preload で反映されず、route handler 経由で `'use cache'` query を呼ぶ integration test（`calendar-reservation.test.ts` / `calendar-event.test.ts` の 3 件）が pre-existing failure。本体コード問題ではなく test 環境設定課題。恒久対策は `bunfig.toml` / `__tests__/setup.ts` での `cacheComponents` mock または該当 query の test 環境 skip 分岐が必要。新規 test 追加時に同エラーに遭遇したら本件として切り分ける
- **`.next/dev/types/{validator.ts,routes.d.ts}` 途切れエラー（TS1434 / TS1128 / TS1005 / TS1011）** — `next typegen` が途中で中断した残骸で `tsc` が失敗する（`validator.ts` は `nst handler = ...` のような欠損行で `Unexpected keyword or identifier`、`routes.d.ts` は連続行で `';' expected` が大量発生する）。dev server 稼働中の Stop hook で type-check が初めて走った時に頻発。復旧: `python3 -c "import shutil; shutil.rmtree('.next', ignore_errors=True)"` + `bunx --bun next typegen` → `bun run type-check`
- **Playwright MCP が navigate/close 両方タイムアウトする場合** — HMR 多発後にブラウザセッションがスタックする。dev サーバーを `cmd //c "taskkill /PID <pid> /F /T"` で強制終了→再起動すると Playwright も新セッションで回復する
- **Playwright MCP の `Browser is already in use for ...mcp-chrome-<id>` エラー** — 別セッション / VS Code 拡張等がブラウザプロファイルをロック中で `browser_close` も同エラーで解除不可。対処: (1) 他の MCP クライアント / 拡張の Chromium を閉じる (2) `cmd //c "taskkill /IM chrome.exe /F"` 相当で残存プロセス除去 (3) 自動化不可時は Read + `curl -s -o /dev/null -w "%{http_code}"` での HTTP 応答確認にフォールバックし、UI 表示確認はユーザーに依頼
- **MINGW64 で `bun run X 2>&1 | tail -N` が途中で切り詰められる** — Bash ツール経由のパイプで長い stdout が truncate されるケースがある。長い出力を確実に取得するには `cmd > /tmp/out 2>&1; echo "EXIT:$?"; tail -N /tmp/out` を使う
- **`MutationResult<T>` は `T | MutationError` で `{ data: T }` ラッパーではない** — `executeAdminMutationResult` の成功時戻り値は `T` そのもの。Integration test で `mock.module("@/admin/lib/admin-action", ...)` を書く際に `return { data }` とすると型エラー（`MutationResult<{id: string}>` に `data` プロパティがない）。mock は `return data;` を直接返す形にする（`__tests__/integration/actions/admin/email-template.test.ts` 参照実装）
- **Bash pipeline の `$?` は最後のコマンドの終了コード** — `cmd 2>&1 | tail -N; echo $?` は tail の exit（常に 0）で元コマンドの失敗を見逃す。必ず `cmd > /tmp/out.log 2>&1; echo "EXIT=$?"; tail -N /tmp/out.log` の形式を使う。`set -o pipefail` は Bash ツール経由の sh wrapper では有効化されないことがある
- **Zod 4: `.merge()` は deprecated** — `.extend(other.shape)` または `z.object({...A.shape, ...B.shape})` に移行する。プロジェクト全体で移行済み
- **Zod 4 `z.string().uuid()` は RFC 9562 version nibble を厳密検証** — `00000000-0000-0000-0000-000000000001` は invalid（3 番目グループ先頭が `[1-8]` 必須、variant bits も `[89abAB]` 要求）。nil UUID `000...000` と max UUID `fff...fff` のみ special case。ハンドクラフトのテストフィクスチャは `11111111-1111-4111-8111-111111111111` のような valid v4（version=4 + variant=8）を使う。Prisma `@default(uuid())` が生成する値は準拠するため実データでは発生しない
- **Zod 4: object `.refine()` 後の `.omit()` / `.extend()` は不可** — `.refine()` 適用後は ZodEffects 化するため構造変更メソッドが使えない。対策: base ZodObject（`.refine()` 前）を export し、派生スキーマはそこから `.omit()` / `.extend()` → 最後に `.refine()`。参照実装: `spaceFormBaseSchema` + `spaceFormSchema`（`validations/space.ts`）。nested schema の cross-field 検証は `collectXxxIssues()` ヘルパーに抽出して parent の `.superRefine()` から呼ぶ(→ `zod-patterns/array-uniqueness.md`)
- **`z.enum(...).default(X)` + RHF `standardSchemaResolver` は input 型を optional 化** — Zod は `.default()` 有りで `z.input` 型のそのフィールドを optional として推論するため、RHF の form value 型が `T | undefined` となり Select/Input の `value` prop に undefined が流入（exactOptionalPropertyTypes 違反 + Radix Select 空文字 placeholder 衝突）。対処: schema から `.default()` を削除し UI の `defaultValues` で補う（確実）。Server Action 側の `.default()` が必要な場合はフォーム用と Server Action 用でスキーマを分離
- **Prettier/formatter が複数行化した箇所の Edit 失敗** — 単行 `foo(A, B)` の Write/Edit 後、PostToolUse hook が `foo(\n  A,\n  B,\n)` に整形する。次の `Edit old_string: "foo(A, B)"` は一致せず失敗。対処: 複数行のパターンで `old_string` を構成、または `Grep -n` で実形状を確認してから Edit。`replace_all` 使用時は特に注意（一度成功すると以降の整形で形状が変わる）
- **`readonly []` empty tuple に `.includes(Role)` は TS2345** — `[] as const satisfies readonly Role[]` は `readonly []` 型になり element type を `never` に推論する。`Record<DashboardRole, readonly Role[]>` を**宣言型**として付ける（`satisfies` ではなく `:` 型注釈）と全エントリが `readonly Role[]` に広がり `.includes(Role)` が通る。参照: `admin-roles.ts` の `INVITABLE_BY`
- **`DomainError` のコード追加時は `DomainErrorCode` type alias を抽出** — コンストラクタ引数型と class プロパティ型の両方を更新する必要があるため、`export type DomainErrorCode = "NOT_FOUND" | ...` を抽出して一元化するとミス防止。`FORBIDDEN` 追加で実施済みパターン（`domain-error.ts`）
- **`as` キャスト監査で raw grep は偽陽性が多い** — `grep "\bas\s+[A-Z]"` は `as const` / `as unknown as` / `import { X as Y }` / `import * as X` / コメント中の "as" をすべて拾う。真の違反数を測るには `grep -vE "as const|as unknown|^import|\* as "` 等でフィルタし、ヒットを type-safety.md §許可例外（DOM event target・Prisma InputJsonValue・keysOf/entriesOf/omitUndefined・validateSectionConfig 内部等）と照合する。raw カウントと実違反が 10倍以上乖離することが多い
- **SSoT 重複検出の grep は symbol 名 + literal 文字列の二段検証必須** — `grep "ROLE_LABELS.*=\s*{$"` のような狭い正規表現は「開き波括弧が同一行」条件で重複定義を見落とす（複数行定義 / 配列中の inline literal / 条件分岐内のハードコードが抜ける）。重複検出の最終検証は ① シンボル名（`ROLE_LABELS` / `StaffRole` / `DASHBOARD_ROLES`）② 実際の定数値 literal（`"スーパー管理者"` / `"閲覧者"` 等）の **両方** で grep し、SSoT モジュール以外にヒットしないことを確認する。`role === "ADMIN" && "管理者"` のようなインライン条件ハードコードは symbol 名では絶対に引っ掛からない
- **Const tuple の `.includes(wideType)` は TS2345** — `readonly [A, B, C] as const` に wider union type（例: `Role`）を `.includes()` で渡すと「型 X は ... に割り当て不可」エラー。`isXxx()` 型ガード helper（`new Set<Role>(TUPLE).has(role)`）で橋渡しする。`admin-roles.ts` の `isDashboardRole` が参照実装
- **`isValid*` 型ガードは `@/shared/lib/validations/enums/guards` から import** — `helpers.ts` は internal import のみで re-export しない。`import { isValidCustomerType } from "@/shared/lib/validations/enums/helpers"` は TS2724（`Did you mean 'getValidCustomerType'?`）。`guards.ts` から直接 import する。`getValid*` / `*_LABELS` / `parseXxxStatusFilter` 等のラベル・parser 系のみ `helpers.ts` が正本
- **`z.enum(TUPLE)` は const tuple 必須** — Zod 4 の `z.enum` は `readonly [string, ...string[]]` を要求。`readonly Role[]` のような widened 型では型エラー。`as const satisfies readonly Role[]` で const tuple を維持する
- **client component から `server-only` モジュールの定数を参照禁止** — `admin-auth.ts` は `import "server-only"` のため、`'use client'` ファイルから `DASHBOARD_ROLES` / `ROLE_LABELS` 等を import するとビルドエラー。SSoT は client-safe モジュール（`admin-roles.ts`）に置き、server-only モジュールは再 export する分離パターン必須。参照実装: `admin-roles.ts` ↔ `admin-auth.ts`
- **Zod `safeParse` 結果を `readonly field?: string` に代入する際は `omitUndefined` 必須** — `z.string().optional()` の出力は `string | undefined` だが、`exactOptionalPropertyTypes: true` 下の `readonly field?: string` は `undefined` を受け付けない。`omitUndefined(result.data)` で橋渡し（→ `zod-patterns/error-formatting.md` §safeParse 結果と exactOptionalPropertyTypes の橋渡し）

- **`useRef` 変数名は `Ref` サフィックス必須** — `@eslint-react/naming-convention-ref-name` が `useRef` の戻り値に `ref` または `*Ref` 命名を要求。`touchStartX` → `touchStartXRef`
- **`useRef<T>()` に初期値なしは TS6 strict でエラー** — `useRef<ReturnType<typeof setTimeout>>()` → `useRef<ReturnType<typeof setTimeout>>(undefined)` と明示する。`useRef` overload は引数1つを要求する
- **Radix `TabsContent` は `Tabs` コンテキスト外で使用不可** — コンポーネントを create/edit モードで共有する場合、`TabsContent` ラップは呼び出し側で行い、中身のフィールドコンポーネントは `Tabs` に依存しない設計にする。`TermsSettingsFields` が実装例
- **ローカル barrel の tree-shaking は信頼できない** — Next.js の `optimizePackageImports` は npm パッケージのみ対象。`index.ts` で re-export すると未使用コンポーネントもバンドルに含まれる可能性がある。バンドルサイズが問題になる場合は barrel 経由ではなく直接 import する（例: `section-parsers.ts` から直接 import して Zod をクライアントバンドルから除去）
- **Turbopack `"use server"` barrel re-export はクライアントから解決できない** — `"use server"` ファイルの関数を `index.ts`（barrel）経由で re-export し、`"use client"` コンポーネントから import すると `Export doesn't exist in target module` ビルドエラー。クライアントコンポーネントからは `@/admin/actions/post/mutations` のようにサブモジュールを直接 import する。Server Component / Server Action 間の barrel re-export は問題ない
- **`global-error.tsx` は Root Layout を完全に置換する** — `<html>` `<body>` を自身で定義するため、admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可。全スタイルをインラインで記述すること（Tailwind クラス禁止）
- **`global-error.tsx` に `@/shared/lib/logger` を import しない** — Client-only バンドルで server-only 依存が混入するリスク。`console.error` を直接使用する
- **layout.tsx 内の `<Suspense fallback={null}>` で children をラップしない** — `loading.tsx` の Suspense boundary を無効化する。children は layout が直接レンダリングし、ページ遷移の loading 表示は `loading.tsx` に委ねる
- **`bun run build` は `@t3-oss/env-nextjs` の検証を有効化**（`SKIP_ENV_VALIDATION` 未設定）— ローカルで env が不足する場合は `bun run build:skip-env`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **Integration test で実 DB 接続が必要なケースは `.env.local` を直接 parse する helper を書く** — `__tests__/setup.ts` が `DATABASE_URL` を `postgresql://test:test@localhost:5432/test` に上書きするため、migration script / schema drift 系 integration test は `getRealDatabaseUrl()` 類の helper で `.env.local` を parse して実 URL を取得する。`process.env["DATABASE_URL"]` が mock URL と一致する場合のみ `.env.local` fallback に切り替え、両方無ければ `skipTest = true` で gracefully skip する（CI では `.env.local` 不在で skip、ローカル開発では実 DB に接続）。参照実装: `__tests__/integration/section-design-migration.test.ts`（Phase B.3）
- **`git stash pop` 後の `bun run validate` で偽の型エラーが出る** — `validate` は `db:generate` を含むため初回実行で Prisma Client が再生成される。再生成前は `Cannot find module` や `Property does not exist` が大量に出るが、validate 完了後に消える。エラーが Prisma 生成型に関連する場合は修正に着手する前に validate を再実行して再現確認する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **`useState` の setter 命名は `set` + state 変数名の PascalCase 必須** — `const [text, setIconText]` は `@eslint-react/use-state` warning。`const [text, setText]` に統一する
- **レンダー中の `Object.assign` 禁止** — `@eslint-react/purity` 違反。`CSSProperties` 構築等で `Object.assign(target, source)` を使うとミュータブル操作とみなされる。`let styles = { ...base, ...conditional }` のスプレッドパターンを使用
- **レンダー中の `new Date()` は避ける** — `@eslint-react/purity`。シリアライズ済み日付（ISO 文字列）を `input[type="date"]` に載せる場合は `dateInputValueFromSerialized()`（`@/shared/lib/serialize`）で文字列のみ正規化する。当日の `min` など「マウント時点で固定したい値」は `useState(() => { ... new Date() ... })` の遅延初期化で一度だけ評価する
- **`useEffect` 内の同期 `setState` は `set-state-in-effect` 警告** — 親 prop の変更を `useEffect(() => { setX(prop) }, [prop])` で同期するパターンは ESLint 警告。代替: ①開くタイミング（イベントハンドラ）で prop を直接セット ② `key` prop でコンポーネントをリマウント ③ `useState` の初期値に prop を渡す（変更追従不要の場合）
- **Client Component で localStorage/sessionStorage を `useState` lazy initializer で読むと hydration mismatch** — `useState(() => window.localStorage.getItem(...))` は SSR で `null`、client 初回 render で値を返すため React が warning を出す。`.claude/rules/react/hooks.md` §useSyncExternalStore に従い、`useSyncExternalStore` + `useRef` キャッシュ + プリミティブ `getServerSnapshot` で書き直す。楽観的更新が必要な場合は別途 `useState` を並走させ、render 中 state sync で橋渡しする（参照: `faq-helpful-vote.tsx`）
- **Turbopack チャンク重複は既知の制限** — Lexical core (275KB×3)、Prism.js (168KB×2) 等が admin 内の異なるルートグループ向けに独立チャンクとして生成される（合計 808KB 無駄）。Webpack の `splitChunks` / `cacheGroups` 相当機能が未成熟なため。`next build --webpack` でフォールバック可能だが、Turbopack の高速ビルドを失う。Next.js パッチ（PR #78194, #78199）で段階的改善中。各ページの First Load JS には影響しない（ディスク上の重複のみ）
- **Turbopack ビルドはルート別 JS サイズを表示しない** — `bun run build` 出力の「Total client JS」は全チャンク合計。1ルートの First Load JS は `.next/server/app/<route>.html` 内の `<script>` 参照チャンクを合計して計算する
- **Turbopack が `¥`（U+00A5）を JSX 属性内でエスケープシーケンスと誤認識** — `placeholder="¥1,000"` 等はビルドエラー（`Invalid unicode escape`）。モジュールレベル定数に `"\u00A51,000"` で定義し `placeholder={CONST}` で参照する
- **Turbopack HMR がコンポーネント変更を反映しない場合がある** — Playwright MCP で確認する際に古いレンダリングが残る。`?_t=N` パラメータ付きナビゲーションでも解消しない場合は dev サーバー再起動（`bun dev`）が必要
- **Turbopack の server-rendered Client Component bundle が Fast Refresh 後も stale する** — Client Component の className / JSX 構造変更後、client bundle は HMR で更新されるのに server-side module cache が古いまま残り、SSR HTML と client hydrate 結果で差分が出る（`+ className="flex items-center gap-2"` vs `- className="justify-self-start"` のような hydration mismatch ログ + `+ 今月` vs `- 今日` のテキスト差分）。`bun run validate` が EXIT=0 でも発生する dev-only 問題。対処: ① `netstat -ano | grep :3000` で PID 特定 ② `cmd //c "taskkill /PID <pid> /F /T"` ③ `python3 -c "import shutil; shutil.rmtree('.next', ignore_errors=True)"` ④ `bun dev` 再起動。Tailwind JIT re-scan issue とは別問題（JIT は新規 class のみ、こちらは既存 class の再配置でも発動）
- **dev サーバーは `db:generate` 後も古い Prisma Client を保持** — `schema.prisma` 変更 → `bun run db:generate` しても、稼働中の `next dev` プロセスはメモリに旧 Prisma Client の型を持ったまま。新カラムを select すると `PrismaClientValidationError: Unknown field ... for select statement on model ...` で 500 → 公開ページは 404 フォールバック。`cmd //c "taskkill /PID <pid> /F /T"` で強制終了 → `bun dev` で再起動が必須
- **dnd-kit `CSS.Transform.toString()` はスケールを含む** — ドラッグ開始時に微妙なサイズ変化でレイアウトシフトが起きる。`translate3d(${x}px, ${y}px, 0)` のみ使用。また動的なマージン（`ml-8`）で幅が変わる場合は `paddingLeft` で代替する
- **`server-only` の間接依存チェーンに注意** — `safe-fetch.ts` 等の共有ユーティリティが `./logger`（`server-only`）を import すると、テストで `mock.module("server-only")` が効かない場合がある。`server-only` なしの `logger-core` を直接 import する。対象: `safe-fetch.ts`, `cron-auth.ts` 等のテスト対象モジュール
- **`bun run test:unit` / `test:integration` はディレクトリ別分離実行** — `bun test` 一括実行（親ディレクトリ指定 / `--watch` のパス未指定）では `mock.module` のグローバル干渉でテストが相互汚染する。`package.json` の `test:unit` / `test:integration` スクリプトは `bun test __tests__/unit/lib && bun test __tests__/unit/api && ...` の形式で `&&` チェーン。日常の単発実行は `bun test <single-file>` のみ許可
- **副作用なし純粋モジュールの `mock.module` 禁止** — `@/shared/lib/constants`（CACHE_TAGS/getCacheTag）と `@/shared/lib/route-responses` は DB 依存も `server-only` 依存もない純粋関数ファイル。`mock.module` すると不完全なモックがグローバル干渉して他テストを壊す。実モジュールをそのまま使用
- **新規テストディレクトリ追加時は `package.json` の `test:unit` / `test:integration` スクリプトにバッチ追加必須** — `bun test __tests__/unit/domain` のような親ディレクトリ指定は `mock.module` 干渉を起こす。`bun test __tests__/unit/domain/<subdomain>` のようにサブディレクトリ単位で分離実行する
- **テスト内で `mock.calls[0]?.[0] as Record<string, unknown>` パターン禁止** — `noUncheckedIndexedAccess` + `as` 禁止に違反。`expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({...}))` を使用
- **`"use server"` ファイルで型を re-export すると Turbopack が `ReferenceError` を投げる** — `export type { X }` は `verbatimModuleSyntax` 下で TypeScript erase されるはずだが、Turbopack の server-actions bundler が型識別子を runtime `export {X as '<hash>'} from 'ACTIONS_MODULEn'` として残し module evaluation 時に `X is not defined` で落ちる。公式仕様は async 関数のみ export 可。型・定数は co-located `<file>-types.ts` に分離する（→ `server-actions/export-contract.md` §`"use server"` ファイルの export 契約）
- **Bash tool で exit code + log 両取りする場合は `cmd > /tmp/log 2>&1; echo "EXIT=$?"` の順序** — `cmd 2>&1 > /tmp/log` は順序逆で stderr が捕捉されずログが空になる。`bun test` / `bun run build` 等で失敗詳細を後から確認したい時に必須
- **`bun run test:integration` は `&&` チェーンで最初の失敗バッチで停止** — `package.json` の `test:integration` は `bun test __tests__/integration/actions/admin && ... && bun test __tests__/integration/api` の形式で、最初の失敗バッチ以降のテストは実行されない。複数 drift がある場合は「失敗バッチを特定 → 修正 → 再実行」の反復で順次潰す。`grep -E "^ [0-9]+ (pass|fail)$"` でバッチ単位の集計が見える
- **`toHaveBeenCalledWith` の `- Expected - 0 / + Received + N` 差分** — 「期待値より N 個多いプロパティがある」の意味。Zod スキーマの `.default()` 値が実装で展開されてテスト期待値に未反映の典型パターン（例: `customerType: CustomerType.PERSONAL` が default で埋まる）。Server Action の呼び出し引数に新規フィールドが追加されたがテスト未更新の兆候でもある
- **`architecture-boundaries.test.ts` の regex は実装パターン変更時に同時更新必須** — `export { X }` 形式と `export const X = ...` 形式は regex `/export\s+\{\s*X\s*\}/u` vs `/export\s+const\s+X\s*=/u` で非互換。公式パターン準拠で実装を変更したら対応テストも更新する（例: `9b59737c` の Prisma singleton 改修で drift が発生し `/revise-claude-md` 実行時に検出された）
- **Integration test のモック漏れは `Authentication failed against the database server` で露見** — Server Action が新しい domain query を呼び出すようになったのに対応する `mock.module` が未追加だと、テストが実 DB に接続しようとして認証エラー。`mypage-account.test.ts` の `getEventIdsByCustomerId` が参照実装（→ `test-quality.md` §mock.module の追従更新）

### ファイル操作・Git

- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイルは `python3 -c "import shutil; shutil.rmtree('path')"` で削除（Windows は `py -3 -c "..."`）
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックがファイルを変更する。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラー
- **`Edit` ツールの `replace_all` は部分一致に注意** — `isJumping` → `isJumpingRef` の rename で `replace_all` を使うと、既存の `isJumpingRef` が `isJumpingRefRef` に二重変換される。rename 対象が別の識別子の部分文字列になる場合は `replace_all` を避け、個別の `old_string` で置換する
- **`git add` 後はコミット前に `git status` 再確認** — Prettier PostToolUse フックが `git add` で他のステージング済みファイルも変更することがある（` M` に変わる）
- **選択的コミット** — 多数のファイルがステージ済みの状態で特定ファイルのみコミットするには `git restore --staged . && git add <target-files>` で再ステージする
- **`git reset --hard` は hook で禁止** — `.claude/hooks/block-dangerous-bash.sh` がブロック。個別 commit 取り消しは `git reset --soft <sha>` で HEAD 移動 → `git restore --staged <file>` → `git checkout HEAD -- <file>` で working tree を個別ファイル単位で復元する。fast-forward merge 前にローカルの stray commit を落とす用途でもこの手順を使う
- **Bash tool の cwd は呼び出し間で永続** — `cd .worktrees/<name> && ...` を実行すると次の Bash 呼び出しも worktree dir に張り付く。意図した作業ディレクトリで動いているか `pwd` で確認するか、明示的に `cd /g/workspace/work/website/customer/myrrh-rental-space` で main に戻す
- **MINGW64 で `git status` の `M` 数 ≠ 実 diff 数** — CRLF 正規化 pending のファイルは `M` として表示されるが内容差分ゼロ。実変更数の真値は `git diff --numstat | wc -l`。`git add -A` で CRLF normalize 後の blob hash が一致する phantom 変更は自動的に unstaged に戻るため実害はないが、変更量の見積もり・commit 分割計画時に誤らない

### Worktree

- **worktree で Prisma 生成ファイルが欠落** — `generated/` は worktree に自動コピーされない。`bun run type-check` で "cannot find module" エラーが出る場合は `robocopy generated .worktrees/<branch>/generated /E /XF nul` で手動コピー（`/XF nul` で Windows `nul` デバイスファイルを除外）
- **スキーマ変更 worktree を main にマージ後は `bun run db:generate` 必須** — `prisma migrate dev` を worktree 内で実行しても main の `generated/` は更新されない。マージ後に main で `bun run db:generate` を実行しないと型エラーが発生する（例: `Module has no exported member 'XxxEnum'`）
- **worktree ブランチを main にローカルマージする際の注意（main に未コミット変更がある場合）**:
  1. `git stash -u` で untracked ファイルも含めてスタッシュ（`git stash` のみでは untracked が残りマージを阻む）
  2. `git stash pop` コンフリクト後 → 解決して `git add` → `git stash drop`（エントリは自動保持されたまま）
  3. worktree ディレクトリを削除済みでもブランチ参照が残る → `git worktree prune` → `git branch -d`
- **Linear history の worktree branch は `git merge --ff-only` で明示統合** — `git rev-list --count main..feature/X` で N commit 先行かつ diverge なしを確認できればまず FF 可能。`--ff-only` は非 FF を拒否するため safety net として機能し、merge commit を誤って生成しない。`git log --oneline` を clean に保つ canonical pattern（2026-04-22 Phase B 統合事例: 7 commit FF merge で main が linear に）
- **ESLint が `.worktrees/` 内ファイルを lint 対象にする** — `eslint.config.mjs` の `globalIgnores` に `.worktrees/**` 追加済み。worktree ディレクトリ名を変えた場合はパターン更新が必要
- **Windows で worktree 削除時の PermissionError** — bun/node プロセス起動中は native binary（`@tailwindcss/oxide-win32-x64-msvc.node` 等）がロックされる。`cmd /c rd /s /q ".worktrees/<name>"` で大部分は削除できるが binary は残る。git 参照だけなら `git worktree prune` + `git branch -d` で十分。完全削除は全プロセス終了後に `powershell.exe -Command "Remove-Item -Recurse -Force '...'"` で実施
- **Native binary のロック元はエディタ拡張も含む** — `tailwindcss-oxide.win32-x64-msvc.node` / `@swc/core-win32-x64-msvc.node` 等は dev server だけでなく **Cursor IDE / VS Code の Tailwind IntelliSense / TypeScript Server 等の拡張**が load し続けることがある（`bun install --force` や `node_modules` 削除時に `UnauthorizedAccessException` / `PermissionError`）。特定: `powershell.exe -NoProfile -Command "Get-Process | Where-Object { \$_.Modules -and (\$_.Modules | Where-Object { \$_.FileName -like '*<binary>*' }) } | Select-Object Id,ProcessName,Path | Format-Table -AutoSize"`。エディタがロック元の場合は一時的に閉じて再 install、または dev / build に影響しない無害 disk 残骸として許容（`.old-*` 1 ディレクトリ残留程度は機能影響ゼロ）
- **worktree 作成時に共有 dev DB がドリフト済みの場合** — main に未コミットの migration が既にローカル Postgres に適用済みの状態で worktree を切ると、worktree の schema.prisma（HEAD 基準）と DB が乖離し、worktree 内の `prisma migrate dev` が drift 検出 → reset 要求で進めない。**対処**: main 側で WIP スナップショット commit（`git add -A && git commit -m "wip: ..."`）を作ってから worktree を branch する。後で main で `git rebase -i` で分割整理可能。`prisma migrate reset` は共有 dev DB を破壊するため避ける
- **worktree drift 時は非破壊 migration でも手動パターン必須** — `prisma migrate dev` は「追加カラムのみ」の非破壊変更でも drift があると全停止（`We need to reset the "public" schema` を要求）する。対処: `TS=$(date -u +%Y%m%d%H%M%S)` → `python3 -c "import os; os.makedirs('prisma/migrations/${TS}_<name>', exist_ok=True)"` → Python で `migration.sql` 書き出し（`prisma/migrations/*.sql` は PreToolUse hook で Write 拒否のため `python3 -c "open(path,'w',encoding='utf-8').write(sql)"` で回避） → `bunx --bun prisma db execute --file <path>` → `bunx --bun prisma migrate resolve --applied <name>` → `bunx --bun prisma generate`。destructive 手順と同じパスを通る
- **worktree に `.env` / `.env.local` をコピーする手段** — PreToolUse が Edit/Write を保護し、`cp .env .worktrees/<n>/.env` のような Bash パターンも deny されるケースがある。**動作確認済みの方法**: `python3 -c "import shutil; shutil.copy2('.env', '.worktrees/<name>/.env')"` で bypass（ファイル内容は一切変更せず複製するだけなので安全）
- **共有 dev DB + 異 worktree dev server は schema-code mismatch を起こす** — worktree A で destructive migration（`DROP COLUMN` 等）を適用し dev server を main（または別 worktree）から起動したままにすると、古い code の Prisma query が dropped column を要求し `PrismaClientKnownRequestError: The column ... does not exist` で 500 → 公開ページが空白・壊れた状態になる silent bug（2026-04-22 B.4 → B.5-1 セッションで実発生、ホームページの spaces/news/events セクションが空白化）。**対処**: migration 適用 worktree から `bun dev` を起動し直す（`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>'"` の CommandLine + ExecutablePath + ParentProcessId を ancestry chain で辿ると CWD を間接判定可能。`wmic` は Windows 11 で廃止済みで空応答のため使わない）。規律: destructive migration 適用後は必ず「どの worktree が dev server を持っているか」確認し、該当 worktree から再起動する
- **`EnterWorktree` native tool（superpowers:using-git-worktrees skill 経由）は `.claude/worktrees/<sanitized-branch>/` を使う** — `/` は `+` に変換される（`feature/x` → `feature+x`）、branch 名は `worktree-<sanitized>` prefix が付く。手動 `git worktree add` の `.worktrees/<branch>/` とは別 path。memory / rule docs で `.worktrees/<branch>/` と書かれている既存記述は手動パターン用で、native tool 利用時は読み替える
- **`git merge --ff-only` は main 側の untracked overwrite を拒否する** — worktree commit に含めたファイルと**同パスの untracked**が main 側にもあると `Updating ... Aborting` で merge abort。spec / plan 等を main 側で先に Write して worktree でも別途コピーした場合に頻発。対処: `python3 -c "import os; os.remove(r'<absolute path>')"` で main 側 untracked を先に削除してから `git merge --ff-only` を再実行。実例: 2026-05-05 Phase 1（Page Template Architecture）で spec / plan を main で先に Write → worktree で同 path にコピー → commit → FF merge abort

### Tailwind v4 / Turbopack HMR

- **新規 arbitrary value / variant class が HMR で scan されず未反映になる** — `max-w-[90rem]` / `md:justify-self-end` / `w-max` / `justify-items-start` 等を source file に新規追加すると、Turbopack HMR では Tailwind JIT が再 scan せず、computed style が `auto` / `none` のまま（`getComputedStyle(el).maxWidth === "none"` 等で検出可能）。**解決**: dev server 再起動で全 source を再 scan する（`netstat -ano | grep :3000` → PID 特定 → `cmd //c "taskkill /PID <pid> /F /T"` → `bun dev` 再起動）。inline style `style={{ maxWidth: "90rem" }}` での bypass は短期対処のみで、restart 後は Tailwind class に戻す
- **複雑な arbitrary value の parse 失敗**: `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` のような関数内カンマ + ネストは Tailwind JIT で CSS 生成されず `grid-template-columns: "1088px"` 単列にフォールバックするケースあり。**代替**: `grid-cols-3` (= 標準クラスで `repeat(3, minmax(0,1fr))` 展開) + `col-start-*` で明示配置すれば同等効果で HMR 安全
- **Grid item の default は `justify-self: stretch`** — 各 grid item は cell 全幅に stretch されるため、子 wrapper への `mx-auto` / `ms-auto` は wrapper 幅固定前提のため効果なし（margin auto が 0 に解決）。**公式パターン**: container に `justify-items-start` で default を明示 + 中央・右端の item に個別 `md:justify-self-center` / `md:justify-self-end` で override（参照実装: `site-header.tsx` の grid-cols-3 header layout）
