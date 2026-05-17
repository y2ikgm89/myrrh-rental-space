---
name: debug-cloud-run
description: >
  Google Cloud Run デプロイ・起動・環境変数の診断スキル。Cloud Build 失敗、
  container startup probe 失敗、Secret Manager 読み込み失敗、環境変数不一致、
  revision 切替失敗、Artifact Registry キャッシュ汚染を切り分ける。
  「デプロイしたのに古いまま」「起動しない」「500 が返る」場面で使用する。
when_to_use: Cloud Run デプロイ・起動に問題が発生したとき。開発者が状況を確認して手動で起動する。AI による自動起動は不可、`/debug-cloud-run` slash command 経由のみ。
disable-model-invocation: true
user-invocable: true
---

# Cloud Run デバッグ

> Myrrh Rental Space の Google Cloud Run 診断ガイド（`cloudbuild.yaml` / `Dockerfile` ベース）

## アーキテクチャ概要

```
gcloud builds submit --config=cloudbuild.yaml
  │
  ├─ Step 1: pull-cache     （Artifact Registry から :cache tag を pull、失敗無視）
  ├─ Step 2: test           （oven/bun:1.3.13 で bun run test:unit）
  ├─ Step 3: build-image    （Docker build、NEXT_SERVER_ACTIONS_ENCRYPTION_KEY は secret）
  ├─ Step 4: push-image     （:SHORT_SHA と :cache を push）
  └─ Step 5: deploy         （gcloud run deploy myrrh-rental-space）
```

**重要**: `NEXT_PUBLIC_*` は **ビルド時にインライン**される（`--build-arg`）ため、値を変えたら
**ビルドやり直しが必須**。Cloud Run の環境変数を後から更新しても client bundle には反映されない。

---

## 診断ステップ

### Step 1 — どこで失敗しているか切り分け

```bash
gcloud builds list --limit=5 --format="table(id,status,createTime,duration)"
gcloud builds log $(gcloud builds list --limit=1 --format="value(id)")
```

| 失敗 step   | 典型原因                                                            |
| ----------- | ------------------------------------------------------------------- |
| pull-cache  | 初回のみ（無視可、`\|\| true` で通過する）                          |
| test        | `bun run test:unit` の失敗 → ローカル再現で調査                     |
| build-image | Dockerfile / 依存解決 / `NEXT_PUBLIC_*` 不足 / Prisma generate 失敗 |
| push-image  | Artifact Registry 権限 / IAM ロール不足                             |
| deploy      | Cloud Run 起動失敗（→ Step 3 へ）                                   |

### Step 2 — Cloud Run 起動ログ確認

```bash
gcloud run services describe myrrh-rental-space --region=asia-northeast1 --format=yaml
gcloud run revisions list --service=myrrh-rental-space --region=asia-northeast1 --limit=5
gcloud run services logs read myrrh-rental-space --region=asia-northeast1 --limit=100
```

- `tcpSocket.port=8080`、`initialDelaySeconds=0 / periodSeconds=10 / failureThreshold=9`（最大 90 秒）
- 90 秒以内に LISTEN しない → `revision failed to become ready`

### Step 3 — Secret Manager 確認

```bash
gcloud secrets list
gcloud secrets versions access latest --secret=DATABASE_URL
```

必要な権限: ランタイム SA に `roles/secretmanager.secretAccessor`。
version は `:latest` を使わず番号固定（→ `reference/commands.md` §Secret Manager）。

### Step 4 — 環境変数のミスマッチ

```bash
gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 \
  --format="value(spec.template.spec.containers[0].env)"
```

`NEXT_PUBLIC_*` はビルド時インラインのため上記には出ない。確認には Docker inspect が必要（→ `reference/commands.md` §環境変数確認）。

### Step 5 — 「デプロイしたのに古いまま」

```bash
gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 \
  --format="value(status.traffic)"
# 古い revision に traffic が固定されていたら:
gcloud run services update-traffic myrrh-rental-space \
  --region=asia-northeast1 --to-latest
```

### Step 6 — Artifact Registry キャッシュ汚染

```bash
gcloud artifacts docker images delete \
  asia-northeast1-docker.pkg.dev/<PROJECT_ID>/myrrh-rental-space/myrrh-rental-space:cache \
  --quiet
```

---

## 参考ファイル

- `reference/commands.md` — ビルドエラー詳細・環境変数確認・ローカル再現コマンド
- `reference/pitfalls.md` — よくある落とし穴一覧
- `cloudbuild.yaml` / `Dockerfile` — ビルド/デプロイ設定の正本
- `src/shared/lib/env/server.ts` — Zod による env バリデーション
