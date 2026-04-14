# Cron ジョブ運用

> Cloud Run + Cloud Scheduler による定期タスクの運用手順。
> 認証: `Authorization: Bearer ${CRON_SECRET}`（GCP OIDC は使わず、既存の
> `authorizeCronRequest` パターン準拠）

## ジョブ一覧

| ジョブ名               | スケジュール (JST) | エンドポイント                   | 目的                                       |
| ---------------------- | ------------------ | -------------------------------- | ------------------------------------------ |
| `calendar-sync`        | 10 分ごと          | `/api/cron/calendar-sync`        | Google Calendar 双方向同期（ポーリング）   |
| `event-import`         | 毎時 0 分          | `/api/cron/event-import`         | GCal 非予約イベントの Event モデル取り込み |
| `faq-trash-cleanup`    | 毎日 03:00         | `/api/cron/faq-trash-cleanup`    | FAQ Recycle Bin 30 日経過項目の完全削除    |
| `faq-stale-check`      | 月曜 09:00         | `/api/cron/faq-stale-check`      | 90 日以上未更新の FAQ を管理通知で報告     |
| `instagram-refresh`    | 毎日 02:00         | `/api/cron/instagram-refresh`    | Instagram long-lived token の自動更新      |
| `instagram-sync`       | 30 分ごと          | `/api/cron/instagram-sync`       | Instagram フィード同期                     |
| `notification-cleanup` | 毎日 04:00         | `/api/cron/notification-cleanup` | 30 日以上前の管理通知を削除                |
| `reservation-reminder` | 毎時 0 分          | `/api/cron/reservation-reminder` | 予約リマインダーメール送信                 |

## 初回セットアップ

1. gcloud CLI 認証: `gcloud auth login`
2. Cloud Scheduler API を有効化:

   ```bash
   gcloud services enable cloudscheduler.googleapis.com --project=<PROJECT_ID>
   ```

3. App Engine アプリを作成（Cloud Scheduler の前提条件、初回のみ）:

   ```bash
   gcloud app create --region=asia-northeast1 --project=<PROJECT_ID>
   ```

4. セットアップスクリプト実行:

   ```bash
   PROJECT_ID=<PROJECT_ID> \
   SERVICE_URL=https://myrrh-rental-space-xxxxx.a.run.app \
   bash scripts/setup-cloud-scheduler.sh
   ```

## スケジュール変更

1. `scripts/setup-cloud-scheduler.sh` の `JOBS` 配列を編集
2. 同じコマンドで再実行（idempotent のため既存ジョブが update される）

## ドライラン

実際にコマンドを発行せず出力のみ確認:

```bash
PROJECT_ID=<PROJECT_ID> \
SERVICE_URL=https://myrrh-rental-space-xxxxx.a.run.app \
DRY_RUN=1 \
bash scripts/setup-cloud-scheduler.sh
```

## ジョブの手動実行（テスト）

```bash
gcloud scheduler jobs run calendar-sync \
  --location=asia-northeast1 \
  --project=<PROJECT_ID>
```

## ジョブの一時停止/再開

```bash
# 一時停止
gcloud scheduler jobs pause <JOB_NAME> --location=asia-northeast1 --project=<PROJECT_ID>

# 再開
gcloud scheduler jobs resume <JOB_NAME> --location=asia-northeast1 --project=<PROJECT_ID>
```

## ジョブ削除（破壊的）

```bash
gcloud scheduler jobs delete <JOB_NAME> --location=asia-northeast1 --project=<PROJECT_ID>
```

## 認証方式の詳細

- **Bearer トークン方式**（本プロジェクトの方式）
  - `Authorization: Bearer ${CRON_SECRET}` ヘッダーを送信
  - Cloud Run の `authorizeCronRequest()` が検証
  - Cloud Run 側は `--allow-unauthenticated` で OK
  - 外部サービス（cron-job.org 等）からの呼び出しも同じ方式で可能
- **GCP OIDC 方式**（本プロジェクトでは未使用）
  - Cloud Scheduler 用 SA + Cloud Run Invoker ロール付与が必要
  - `--oidc-service-account-email` + `--oidc-token-audience` フラグ
  - より強固だが外部サービスから呼べない

Bearer 方式を選択した理由: 既存 `authorizeCronRequest` パターンとの互換性、
および将来的に外部スケジューラへ切り替える自由度を残すため。

## 監視

Cloud Logging で各ジョブの実行ログを確認:

```bash
gcloud logging read \
  'resource.type=cloud_scheduler_job AND resource.labels.job_id=<JOB_NAME>' \
  --project=<PROJECT_ID> \
  --limit=20 \
  --format=json
```

失敗ジョブは自動リトライ（`max-retry-attempts=3`、指数バックオフ 30s→600s）。

## トラブルシューティング

### 401 Unauthorized

- `CRON_SECRET` の不一致。Secret Manager の `CRON_SECRET` と Cloud Scheduler に
  登録されたトークンが同じか確認（スクリプト再実行で同期）

### 404 Not Found

- Cloud Run のエンドポイントがデプロイされていない。`cloudbuild.yaml` での
  ビルド完了を確認

### 500 Internal Server Error

- Cloud Run のログを確認（`gcloud logging read ...`）。DB 接続エラー・
  外部 API エラーなどをチェック

### タイムアウト

- `--attempt-deadline=300s` を超過。長時間処理は `calendar-sync` のような
  ポーリング+ pg_advisory_lock パターンで複数回に分けて処理する設計に変更
