# コマンド詳細

> 親 skill: [../SKILL.md](../SKILL.md)

## Cloud Build エラー詳細

```bash
# 特定ビルドの生ログ
gcloud builds log <BUILD_ID>

# Cloud Console での確認
# https://console.cloud.google.com/cloud-build/builds;region=global
```

| エラー                                                               | 原因                                         | 対処                                                    |
| -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `failed to solve: process "/bin/sh -c bun install" did not complete` | `bun.lock` と `package.json` の drift        | ローカルで `bun install --frozen-lockfile` 成功確認     |
| `Error: @prisma/client did not initialize yet`                       | Dockerfile で `prisma generate` 漏れ         | Dockerfile の `RUN bun run db:generate` を確認          |
| `Type error: Cannot find module '@generated/prisma/...'`             | `bun run db:generate` 前に `next build` 実行 | 順序確認                                                |
| `NEXT_PUBLIC_BASE_URL is required`                                   | `cloudbuild.yaml` の substitution 未設定     | `_NEXT_PUBLIC_BASE_URL=...` を `--substitutions` で渡す |
| `secret "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" not found`              | Secret Manager に未登録 or version 不一致    | `gcloud secrets list` で確認                            |

## 起動失敗の原因別対処

| 症状                                                    | 原因                                            | 対処                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `container failed to start and listen on port 8080`     | Next.js が 8080 で待たない（デフォルト 3000）   | Dockerfile の `ENV PORT=8080` 確認、`next start -p $PORT`                                        |
| `DATABASE_URL is not defined` (起動ログ)                | Secret Manager バインド失敗                     | `gcloud run services describe ... --format="value(spec.template.spec.containers[0].env)"` で確認 |
| `PrismaClientInitializationError: Can't reach database` | DATABASE_URL 不正 / ネットワーク設定未設定      | `DATABASE_URL` フォーマット確認、接続先ホスト・ポートの疎通確認                                  |
| `Error: ENCRYPTION_KEY must be 32 bytes`                | Secret の値が壊れている                         | `gcloud secrets versions access latest --secret=ENCRYPTION_KEY` で長さ確認                       |
| 起動は成功するが 500                                    | `BETTER_AUTH_URL` の不一致 / Zod env 検証エラー | `logError` 出力をログから探す                                                                    |

## Secret Manager 操作

```bash
# バージョン一覧
gcloud secrets versions list DATABASE_URL

# 値の取得（注意: 端末に出力される）
gcloud secrets versions access latest --secret=DATABASE_URL

# Cloud Run SA に secret accessor 権限確認
gcloud projects get-iam-policy <PROJECT_ID> \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  | grep secretmanager
```

**version 固定**: `cloudbuild.yaml` は `_DATABASE_URL_SECRET_VERSION` 等で固定バージョンを指定。
新しい値を使うときは Secret を新バージョンで作成 → `cloudbuild.yaml` の version を bump（`:1` → `:2`）→ 再ビルド。

## 環境変数確認

| カテゴリ           | 変数                           | 確認方法                          |
| ------------------ | ------------------------------ | --------------------------------- |
| ビルド時インライン | `NEXT_PUBLIC_*`                | Docker image の env / HTML ソース |
| ランタイム         | `BETTER_AUTH_URL` / `NODE_ENV` | `gcloud run services describe`    |
| Secret             | `DATABASE_URL` 他              | `gcloud secrets versions list`    |

`NEXT_PUBLIC_*` を Docker inspect で確認する場合:

```bash
docker pull asia-northeast1-docker.pkg.dev/<PROJECT_ID>/myrrh-rental-space/myrrh-rental-space:<SHORT_SHA>
docker inspect asia-northeast1-docker.pkg.dev/.../myrrh-rental-space:<SHORT_SHA> \
  | jq '.[0].Config.Env'
```

## ローカル再現

```bash
# Cloud Run と同じ条件で Docker build
docker build \
  --build-arg NEXT_PUBLIC_BASE_URL=http://localhost:8080 \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:8080 \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=... \
  -t myrrh-rental-space:local .

# 起動
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DATABASE_URL="..." \
  -e BETTER_AUTH_SECRET="..." \
  -e ENCRYPTION_KEY="..." \
  -e BETTER_AUTH_URL="http://localhost:8080" \
  myrrh-rental-space:local
```

## Cloud Run 設定パラメータ

```
region=asia-northeast1 / port=8080 / memory=1Gi / cpu=1
min-instances=0 / max-instances=1 / concurrency=80 / timeout=300
execution-environment=gen2 / cpu-boost
startup-probe=tcpSocket.port=8080 (initialDelay=0, period=10, failure=9)
```

## 参考 URL

- Cloud Run healthchecks: https://cloud.google.com/run/docs/configuring/healthchecks
- Cloud Build substitutions: https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values
