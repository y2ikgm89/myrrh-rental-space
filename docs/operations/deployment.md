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

### Cloud Build サービスアカウント

Cloud Build SA (`<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com`) に必要なロール:

```bash
PROJECT_ID=<PROJECT_ID>
CB_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/iam.serviceAccountUser"
```

### Cloud Run サービスアカウント

ランタイム SA に Secret Manager アクセス権を付与:

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:<RUNTIME_SA_EMAIL>" \
  --role="roles/secretmanager.secretAccessor"
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

## 6. Cloud Build トリガー設定

`NEXT_PUBLIC_*` 変数はビルド時にクライアント JS へインライン化されるため、
Cloud Build トリガーの substitutions で実際の値を設定する:

| Substitution                      | 用途               | 必須 |
| --------------------------------- | ------------------ | ---- |
| `_NEXT_PUBLIC_BASE_URL`           | 公開サイト URL     | Yes  |
| `_NEXT_PUBLIC_APP_URL`            | アプリ URL         | Yes  |
| `_NEXT_PUBLIC_SUPABASE_URL`       | Supabase URL       | Yes  |
| `_NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Supabase Anon Key  | Yes  |
| `_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile Site Key | No   |
| `_NEXT_PUBLIC_GA_MEASUREMENT_ID`  | GA4 測定 ID        | No   |
| `_BETTER_AUTH_URL`                | Better Auth URL    | Yes  |

## 7. デプロイ

```bash
gcloud builds submit --config=cloudbuild.yaml
```

Cloud Build は以下を実行:

1. キャッシュイメージの pull（初回は skip）
2. Docker build（validate + next build を含む、`NEXT_PUBLIC_*` をビルド引数で注入し、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は BuildKit secret で注入）
3. Artifact Registry push（`SHORT_SHA` + `cache` タグ）
4. Cloud Run deploy（シークレット注入、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` を runtime にも固定注入し、`--cpu-boost` 有効）

## 8. マイグレーション

Prisma マイグレーションは Cloud Run Job で実行:

```bash
gcloud run jobs create prisma-migrate \
  --region asia-northeast1 \
  --image asia-northeast1-docker.pkg.dev/<PROJECT_ID>/myrrh-rental-space/myrrh-rental-space:<TAG> \
  --set-secrets DATABASE_URL=DATABASE_URL:<VERSION> \
  --command bunx \
  --args prisma,migrate,deploy

gcloud run jobs execute prisma-migrate --region asia-northeast1 --wait
```

## 9. アーキテクチャ

### Dockerfile（3-stage multi-stage build）

| Stage     | Base                     | 内容                                 |
| --------- | ------------------------ | ------------------------------------ |
| `deps`    | `oven/bun:1.3.10-alpine` | 依存インストール + Prisma generate   |
| `builder` | `oven/bun:1.3.10-alpine` | validate + next build                |
| `runner`  | `oven/bun:1.3.10-alpine` | standalone output + 非 root ユーザー |

- Bun ランタイム: Cold Start が Node.js より高速
- `openssl` 不要: Prisma 7 `engineType = "client"` は WASM ベース
- `libc6-compat`: bcrypt 等のネイティブモジュール互換

### Cloud Run 設定

| 設定             | 値                        |
| ---------------- | ------------------------- |
| 実行環境         | Gen2                      |
| CPU Boost        | 有効（Cold Start 高速化） |
| メモリ           | 1Gi                       |
| CPU              | 1                         |
| 最小インスタンス | 0                         |
| 最大インスタンス | 1                         |
| 同時実行数       | 80                        |

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は Next.js の self-hosting 要件に合わせて build 時と runtime の両方で同じ値を固定し、shared cache / deployment coordination を導入するまでは単一インスタンス運用を前提にする。

第1段階の正本は `max-instances=1` での単一インスタンス運用とする。水平スケールへ移行する場合は、shared cache backend と deployment coordination を導入してから `max-instances` を引き上げる。

### Docker レイヤーキャッシュ

- BuildKit + `BUILDKIT_INLINE_CACHE=1` でキャッシュメタデータを埋め込み
- `:cache` タグで前回ビルドのレイヤーを再利用
- 依存関係未変更時のビルド時間を大幅短縮

## 参考

- [Cloud Run](https://cloud.google.com/run/docs)
- [Artifact Registry](https://cloud.google.com/artifact-registry/docs)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Next.js with-docker Example](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
