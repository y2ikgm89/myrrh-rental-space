# Cloud Run デプロイ手順

Cloud Run (Gen2) + Artifact Registry + Cloud Build によるデプロイ。

## 1. 前提

- Google Cloud プロジェクト作成済み
- `gcloud` / `docker` / `bun` インストール済み
- リージョン: `asia-northeast1`

## 2. API 有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

## 3. Artifact Registry 作成

```bash
gcloud artifacts repositories create myrrh-rental-space \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Container images for myrrh-rental-space"
```

## 4. IAM

### Cloud Run / Prisma migrate Job 用 dedicated service account

Cloud Run 最小権限原則（[公式](https://cloud.google.com/run/docs/configuring/service-accounts)）に従い、
Compute Engine default SA は使わず専用 SA を作成する:

```bash
PROJECT_ID=<PROJECT_ID>
SA_NAME="myrrh-rental-space-runtime"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create $SA_NAME \
  --display-name="Myrrh Rental Space runtime SA" \
  --project=$PROJECT_ID

# Secret Manager 読み取り
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"

# Cloud Run Job (prisma-migrate) 実行時ログ
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/logging.logWriter"
```

Cloud Build から `gcloud run jobs execute` / `gcloud run deploy` を動かすため、Cloud Build SA に権限を付与:

```bash
CB_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/run.admin"

# Cloud Build SA が runtime SA として Cloud Run を動かせるようにする
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --member="serviceAccount:$CB_SA" \
  --role="roles/iam.serviceAccountUser"
```

## 5. Secret Manager

必須シークレット:

| シークレット                         | 用途                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| `DATABASE_URL`                       | PostgreSQL 接続                                                    |
| `BETTER_AUTH_SECRET`                 | Better Auth 署名キー                                               |
| `ENCRYPTION_KEY`                     | API キー暗号化 (64 hex chars)                                      |
| `CRON_SECRET`                        | CRON エンドポイント認証                                            |
| `ADMIN_LOGIN_TOKEN`                  | 管理画面アクセス制限                                               |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Next.js Server Actions の build-time / runtime 共通 encryption key |
| `R2_*`（5 個）                       | Cloudflare R2 画像ストレージ                                       |

```bash
echo -n "postgresql://..." | gcloud secrets create DATABASE_URL --data-file=-
echo -n "..." | gcloud secrets create BETTER_AUTH_SECRET --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create ENCRYPTION_KEY --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create CRON_SECRET --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create ADMIN_LOGIN_TOKEN --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --data-file=-
```

任意シークレット（機能有効化時に追加）:

| シークレット           | 用途                                 |
| ---------------------- | ------------------------------------ |
| `RESEND_API_KEY`       | メール送信 (Resend)                  |
| `TURNSTILE_SECRET_KEY` | CAPTCHA (Cloudflare Turnstile)       |
| `GOOGLE_CLIENT_ID`     | Google OAuth / Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth / Google Calendar OAuth |
| `INSTAGRAM_APP_ID`     | Instagram API                        |
| `INSTAGRAM_APP_SECRET` | Instagram API                        |

シークレット更新: `gcloud secrets versions add <NAME> --data-file=-`

Cloud Run へは固定バージョンで注入する（`cloudbuild.yaml` の `_*_SECRET_VERSION` で管理）。

任意シークレットは `--update-secrets` で追加（デプロイで上書きされない）:

```bash
gcloud run services update myrrh-rental-space \
  --region asia-northeast1 \
  --update-secrets=RESEND_API_KEY=RESEND_API_KEY:1
```

## 6. Prisma migrate Cloud Run Job 初期作成（初回のみ）

cloudbuild.yaml は毎回 `gcloud run jobs update` → `execute` で migration を実行する設計のため、
**初回は Job を手動で作成する必要がある**。作成時点で initial image は placeholder でよい（cloudbuild.yaml の次回実行で上書きされる）:

```bash
PROJECT_ID=<PROJECT_ID>
REGION=asia-northeast1
SA_EMAIL="myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
PLACEHOLDER_IMAGE="gcr.io/google-samples/hello-app:1.0"

gcloud run jobs create prisma-migrate \
  --region $REGION \
  --image $PLACEHOLDER_IMAGE \
  --service-account $SA_EMAIL \
  --command bunx \
  --args --bun,prisma,migrate,deploy \
  --set-secrets DATABASE_URL=DATABASE_URL:1 \
  --max-retries 0 \
  --task-timeout 600
```

Secret バージョンを更新する場合は `gcloud run jobs update prisma-migrate --update-secrets ...` を手動実行する（cloudbuild.yaml は image のみ更新）。

## 7. Cloud Build トリガー設定

`NEXT_PUBLIC_*` 変数はビルド時にクライアント JS へインライン化されるため、
Cloud Build トリガーの substitutions で実際の値を設定する:

| Substitution                      | 用途                                            | 必須            |
| --------------------------------- | ----------------------------------------------- | --------------- |
| `_SERVICE_ACCOUNT`                | Cloud Run / migrate Job 共通 runtime SA         | **Yes**         |
| `_NEXT_PUBLIC_BASE_URL`           | 公開サイト URL                                  | **Yes**         |
| `_NEXT_PUBLIC_APP_URL`            | アプリ URL                                      | **Yes**         |
| `_BETTER_AUTH_URL`                | Better Auth ベース URL                          | **Yes**         |
| `_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile Site Key                              | No              |
| `_NEXT_PUBLIC_GA_MEASUREMENT_ID`  | GA4 測定 ID                                     | No              |
| `_DATABASE_POOL_MAX`              | pg Pool 最大接続数（Cloud Run 1 vCPU 推奨: 10） | No (default 10) |

`NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL` は `validateProductionEnv()` でコンテナ起動時に fail-fast 検証される。未設定だと `instrumentation.register()` が throw してデプロイが unhealthy になる。

## 8. デプロイ

```bash
gcloud builds submit --config=cloudbuild.yaml
```

Cloud Build は以下を順に実行:

1. キャッシュイメージの pull（初回は skip）
2. ユニットテスト（`bun run test:unit`）
3. Docker build（`NEXT_PUBLIC_*` をビルド引数、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` を BuildKit secret で注入）
4. Artifact Registry push（`SHORT_SHA` + `cache` タグ）
5. **Prisma migrate Job image を新イメージに update**
6. **Prisma migrate Job 実行**（`bunx --bun prisma migrate deploy` を `--wait` で待機、failure 時はデプロイ全体停止）
7. Cloud Run deploy（シークレット注入、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` を runtime 固定注入、`--cpu-boost` + `--no-cpu-throttling`、startup/liveness probe は `/api/live`）

## 9. アーキテクチャ

### Dockerfile（3-stage multi-stage build）

| Stage     | Base                     | 内容                                                                             |
| --------- | ------------------------ | -------------------------------------------------------------------------------- |
| `deps`    | `oven/bun:1.3.12-alpine` | 依存インストール + Prisma generate                                               |
| `builder` | `oven/bun:1.3.12-alpine` | validate + next build                                                            |
| `runner`  | `oven/bun:1.3.12-alpine` | standalone output + 非 root ユーザー、`HOSTNAME=0.0.0.0`、PORT は Cloud Run 注入 |

- Bun ランタイム: Cold Start が Node.js より高速
- `openssl` 不要: Prisma 7 `engineType = "client"` は WASM ベース
- `libc6-compat`: bcrypt 等のネイティブモジュール互換
- `ENV PORT` を **設定しない**: Cloud Run Container Runtime Contract の PORT 注入に委譲（[公式](https://cloud.google.com/run/docs/container-contract#port)）
- runner に **`node_modules/prisma` + `prisma/`（schema + migrations）** を明示コピー: Cloud Run Job が同一 image で `bunx --bun prisma migrate deploy` を走らせるため。Next.js standalone trace は CLI パッケージを含まない

### Cloud Run 設定

| 設定              | 値                                                            |
| ----------------- | ------------------------------------------------------------- |
| 実行環境          | Gen2                                                          |
| CPU 割当          | 常時（`--no-cpu-throttling`）— fireAndForget / after() 安定化 |
| CPU Boost         | 有効（Cold Start 高速化）                                     |
| メモリ            | 1Gi                                                           |
| CPU               | 1                                                             |
| 最小インスタンス  | 0                                                             |
| 最大インスタンス  | 1（単一インスタンス運用）                                     |
| 同時実行数        | 80                                                            |
| startup-probe     | HTTP GET `/api/live`（軽量 alive エンドポイント）             |
| liveness-probe    | HTTP GET `/api/live`（DB 非依存、一時断で kill されない）     |
| DATABASE_POOL_MAX | 10（pg Pool 最大接続数、1 vCPU 想定）                         |

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は Next.js の self-hosting 要件に合わせて build 時と runtime の両方で同じ値を固定し、shared cache / deployment coordination を導入するまでは単一インスタンス運用を前提にする。

第 1 段階の正本は `max-instances=1` での単一インスタンス運用とする。水平スケールへ移行する場合は、shared cache backend と deployment coordination を導入してから `max-instances` を引き上げる。

### Health Check 役割分担

| エンドポイント | 用途                           | DB 依存              |
| -------------- | ------------------------------ | -------------------- |
| `/api/live`    | startup-probe / liveness-probe | なし                 |
| `/api/health`  | 監視・手動確認用（詳細）       | あり（503 返却可能） |

`/api/health` を liveness-probe に割り当てると DB 一時断でコンテナが連鎖的に kill される。`/api/live` は process-alive だけを判定する。

### Docker レイヤーキャッシュ

- BuildKit + `BUILDKIT_INLINE_CACHE=1` でキャッシュメタデータを埋め込み
- `:cache` タグで前回ビルドのレイヤーを再利用
- 依存関係未変更時のビルド時間を大幅短縮

## 参考

- [Cloud Run](https://cloud.google.com/run/docs)
- [Cloud Run Container Runtime Contract](https://cloud.google.com/run/docs/container-contract)
- [Cloud Run Healthchecks](https://cloud.google.com/run/docs/configuring/healthchecks)
- [Cloud Run Service Accounts](https://cloud.google.com/run/docs/configuring/service-accounts)
- [Cloud Run CPU Allocation](https://cloud.google.com/run/docs/configuring/cpu-allocation)
- [Artifact Registry](https://cloud.google.com/artifact-registry/docs)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Next.js with-docker Example](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
