---
name: cloud-run-debug
description: >
  Google Cloud Run デプロイ・起動・環境変数の診断スキル。Cloud Build 失敗、
  container startup probe 失敗、Secret Manager 読み込み失敗、環境変数不一致、
  revision 切替失敗、Artifact Registry キャッシュ汚染を切り分ける。
  「デプロイしたのに古いまま」「起動しない」「500 が返る」場面で使用する。
---

# Cloud Run デバッグ

> Myrrh Rental Space の Google Cloud Run 診断ガイド（`cloudbuild.yaml` / `Dockerfile` ベース）

## アーキテクチャ概要

```
gcloud builds submit --config=cloudbuild.yaml
  │
  ├─ Step 1: pull-cache     （Artifact Registry から :cache tag を pull、失敗無視）
  ├─ Step 2: test           （oven/bun:1.3.11 で bun run test:unit）
  ├─ Step 3: build-image    （Docker build、NEXT_SERVER_ACTIONS_ENCRYPTION_KEY は secret）
  ├─ Step 4: push-image     （:SHORT_SHA と :cache を push）
  └─ Step 5: deploy         （gcloud run deploy myrrh-rental-space）

Secret Manager:
  DATABASE_URL / BETTER_AUTH_SECRET / ENCRYPTION_KEY / CRON_SECRET
  ADMIN_LOGIN_TOKEN / NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

Runtime env (非 secret):
  NODE_ENV=production / NEXT_TELEMETRY_DISABLED=1
  NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL
  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_TURNSTILE_SITE_KEY / NEXT_PUBLIC_GA_MEASUREMENT_ID

Cloud Run 設定:
  region=asia-northeast1 / port=8080 / memory=1Gi / cpu=1
  min-instances=0 / max-instances=1 / concurrency=80 / timeout=300
  execution-environment=gen2 / cpu-boost
  startup-probe=tcpSocket.port=8080 (initialDelay=0, period=10, failure=9)
```

**重要**: `NEXT_PUBLIC_*` は **ビルド時にインライン**される（`--build-arg`）ため、値を変えたら
**ビルドやり直しが必須**。Cloud Run の環境変数を後から更新しても client bundle には反映されない。

---

## 診断ステップ

### Step 1 — どこで失敗しているか切り分け

```bash
# 直近ビルドの一覧
gcloud builds list --limit=5 --format="table(id,status,createTime,duration)"

# 直近ビルドのログ
gcloud builds log $(gcloud builds list --limit=1 --format="value(id)")

# 失敗箇所: Step 1 pull-cache / Step 2 test / Step 3 build-image / Step 4 push / Step 5 deploy
```

**判定**:

| 失敗 step   | 典型原因                                                            |
| ----------- | ------------------------------------------------------------------- |
| pull-cache  | 初回のみ（無視可、`\|\| true` で通過する）                          |
| test        | `bun run test:unit` の失敗 → ローカル再現で調査                     |
| build-image | Dockerfile / 依存解決 / `NEXT_PUBLIC_*` 不足 / Prisma generate 失敗 |
| push-image  | Artifact Registry 権限 / IAM ロール不足                             |
| deploy      | Cloud Run 起動失敗（→ Step 3 へ）                                   |

### Step 2 — Cloud Build 詳細ログ

```bash
# 特定ビルドの生ログ
gcloud builds log <BUILD_ID>

# Cloud Console での確認
# https://console.cloud.google.com/cloud-build/builds;region=global
```

**よくあるビルドエラー**:

| エラー                                                               | 原因                                         | 対処                                                    |
| -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `failed to solve: process "/bin/sh -c bun install" did not complete` | `bun.lock` と `package.json` の drift        | ローカルで `bun install --frozen-lockfile` 成功確認     |
| `Error: @prisma/client did not initialize yet`                       | Dockerfile で `prisma generate` 漏れ         | Dockerfile の `RUN bun run db:generate` を確認          |
| `Type error: Cannot find module '@generated/prisma/...'`             | `bun run db:generate` 前に `next build` 実行 | 順序確認                                                |
| `NEXT_PUBLIC_BASE_URL is required`                                   | `cloudbuild.yaml` の substitution 未設定     | `_NEXT_PUBLIC_BASE_URL=...` を `--substitutions` で渡す |
| `secret "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" not found`              | Secret Manager に未登録 or version 不一致    | `gcloud secrets list` で確認                            |

### Step 3 — Cloud Run 起動失敗（startup probe）

```bash
# デプロイされたサービスの状態
gcloud run services describe myrrh-rental-space --region=asia-northeast1 --format=yaml

# 最新 revision の状態
gcloud run revisions list --service=myrrh-rental-space --region=asia-northeast1 --limit=5

# 起動ログ（直近 100 行）
gcloud run services logs read myrrh-rental-space --region=asia-northeast1 --limit=100
```

**startup probe の挙動**:

- `tcpSocket.port=8080` — コンテナが 8080 を LISTEN するまで待機
- `initialDelaySeconds=0 / periodSeconds=10 / failureThreshold=9` — 最大 90 秒
- 90 秒以内に LISTEN しない → `revision failed to become ready`

**よくある原因**:

| 症状                                                    | 原因                                            | 対処                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `container failed to start and listen on port 8080`     | Next.js が 8080 で待たない（デフォルト 3000）   | Dockerfile の `ENV PORT=8080` 確認、`next start -p $PORT`                                        |
| `DATABASE_URL is not defined` (起動ログ)                | Secret Manager バインド失敗                     | `gcloud run services describe ... --format="value(spec.template.spec.containers[0].env)"` で確認 |
| `PrismaClientInitializationError: Can't reach database` | Supabase pooler URL 不正 / IP allow list 未設定 | `DATABASE_URL` が pooler 経由か確認                                                              |
| `Error: ENCRYPTION_KEY must be 32 bytes`                | Secret の値が壊れている                         | `gcloud secrets versions access latest --secret=ENCRYPTION_KEY` で長さ確認                       |
| 起動は成功するが 500                                    | `BETTER_AUTH_URL` の不一致 / Zod env 検証エラー | `logError` 出力をログから探す                                                                    |

### Step 4 — Secret Manager の確認

```bash
# secret 一覧
gcloud secrets list

# 特定 secret のバージョン一覧
gcloud secrets versions list DATABASE_URL

# 値の取得（注意: 端末に出力される）
gcloud secrets versions access latest --secret=DATABASE_URL

# Cloud Run サービスアカウントに secret accessor 権限があるか
gcloud projects get-iam-policy <PROJECT_ID> \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  | grep secretmanager
```

**必要な権限**: Cloud Run のランタイムサービスアカウント（通常 `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
または専用 SA）に `roles/secretmanager.secretAccessor` が必要。

**version 固定**: `cloudbuild.yaml` は `_DATABASE_URL_SECRET_VERSION` 等で**固定バージョン**を指定。
新しい値を使うときは Secret を新バージョンで作成 → `cloudbuild.yaml` の version を bump（`:1` → `:2`）→ 再ビルド。
`:latest` を使わない理由は再デプロイなしで値が変わると挙動が変わるため。

### Step 5 — 環境変数のミスマッチ

```bash
# デプロイ済み revision の env 一覧
gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 \
  --format="value(spec.template.spec.containers[0].env)"

# NEXT_PUBLIC_* は build-arg なのでここには出ない
# → Artifact Registry のイメージを inspect するか、ローカル pull して確認
docker pull asia-northeast1-docker.pkg.dev/<PROJECT_ID>/myrrh-rental-space/myrrh-rental-space:<SHORT_SHA>
docker inspect asia-northeast1-docker.pkg.dev/.../myrrh-rental-space:<SHORT_SHA> \
  | jq '.[0].Config.Env'
```

**確認項目**:

| カテゴリ           | 変数                           | 確認方法                          |
| ------------------ | ------------------------------ | --------------------------------- |
| ビルド時インライン | `NEXT_PUBLIC_*`                | Docker image の env / HTML ソース |
| ランタイム         | `BETTER_AUTH_URL` / `NODE_ENV` | `gcloud run services describe`    |
| Secret             | `DATABASE_URL` 他              | `gcloud secrets versions list`    |

### Step 6 — 「デプロイしたのに古いまま」問題

```bash
# 現在トラフィックが流れている revision
gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 \
  --format="value(status.traffic)"

# 最新の revision が 100% を受けているか確認
# もし古い revision に traffic が固定されていたら:
gcloud run services update-traffic myrrh-rental-space \
  --region=asia-northeast1 \
  --to-latest
```

**CDN / ブラウザキャッシュ**:

- Next.js の static asset は `/_next/static/` で immutable キャッシュ
- HTML は `Cache-Control: private, no-cache` なので即時反映されるはず
- 反映されない場合はブラウザで hard reload（`Ctrl+Shift+R`）

### Step 7 — Artifact Registry キャッシュ汚染

```bash
# :cache tag を破棄して再ビルド（npm audit fix や依存更新後に有効）
gcloud artifacts docker images delete \
  asia-northeast1-docker.pkg.dev/<PROJECT_ID>/myrrh-rental-space/myrrh-rental-space:cache \
  --quiet

# 次回のビルドで pull-cache が fail（`|| true` で通過）→ full rebuild
```

---

## ローカル再現

```bash
# Cloud Run と同じ条件で Docker build
docker build \
  --build-arg NEXT_PUBLIC_BASE_URL=http://localhost:8080 \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:8080 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
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

# ブラウザで http://localhost:8080 を確認
```

---

## よくある落とし穴

- **`NEXT_PUBLIC_*` をランタイム env で渡しても効かない** — ビルド時インライン必須（`cloudbuild.yaml` の `--build-arg` に追加）
- **`min-instances=0` でコールドスタートが遅い** — 初回リクエストが 5-10 秒かかる。頻度が高いなら `min-instances=1` に変更
- **`max-instances=1` で同時実行制限** — 負荷テスト時にボトルネック。本番調整時は増やす
- **`timeout=300`（5分）を超えるリクエスト** — Server Action の長時間処理は背景ジョブに分離
- **Secret Manager の version を `:latest` にしない** — 再デプロイせずに挙動が変わるとデバッグ不能

---

## 参考

- `cloudbuild.yaml` / `Dockerfile` — ビルド/デプロイ設定の正本
- `src/shared/lib/env/server.ts` — Zod による env バリデーション
- Cloud Run healthchecks: https://cloud.google.com/run/docs/configuring/healthchecks
- Cloud Build substitutions: https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values
