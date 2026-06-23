# Cron Secret Rotation Runbook

## 対象

`CRON_SECRET` を回転させる手順。Cloud Scheduler の HTTP target が `Authorization: Bearer <CRON_SECRET>` で叩き、Cloud Run 側の [`authorizeCronRequest`](../../src/shared/lib/cron-auth.ts) が同値を検証する。両端が同じ値を持たないと全 cron が 401 で停止する。

## 構成

- **保管先**: Google Secret Manager（secret 名: `CRON_SECRET`）
- **Cloud Run**: [`cloudbuild.yaml`](../../cloudbuild.yaml) の `--update-secrets=CRON_SECRET=CRON_SECRET:${_CRON_SECRET_VERSION}` で version 固定 mount。version は substitution `_CRON_SECRET_VERSION`
- **Cloud Scheduler**: [`scripts/setup-cloud-scheduler.sh`](../../scripts/setup-cloud-scheduler.sh) が `gcloud secrets versions access latest` で取得して `Authorization` header に焼き込む（既存ジョブは upsert で update）
- **環境変数 schema**: `src/shared/lib/env/server.ts` の `CRON_SECRET = z.string().min(32)`（短すぎる値は本番起動を拒否）

## ローテーション手順（無停止）

新 version を Secret Manager に追加 → cloudbuild substitution を bump して redeploy → Cloud Scheduler を再 upsert、の 3 ステップ。**Cloud Run と Cloud Scheduler 両方を新値に揃えるまで旧 version を消さない**こと。

### 1. 新 secret version を追加

```bash
# 新トークンを生成（最低 32 文字、URL 安全文字のみ）
NEW_CRON_SECRET=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 64)

# Secret Manager に新 version として追加（旧 version は残る）
printf '%s' "${NEW_CRON_SECRET}" | gcloud secrets versions add CRON_SECRET \
  --project="${PROJECT_ID}" \
  --data-file=-

# 追加された version 番号を確認（例: "2"）
gcloud secrets versions list CRON_SECRET --project="${PROJECT_ID}" --limit=5
```

### 2. cloudbuild substitution を bump して redeploy

`cloudbuild.yaml` の `_CRON_SECRET_VERSION` を新 version 番号に更新して commit / merge。Cloud Build trigger（main push）が走り、Cloud Run が新 secret version を mount した状態でローリングデプロイされる。

```yaml
# cloudbuild.yaml
substitutions:
  _CRON_SECRET_VERSION: "2" # ← bump
```

```bash
# 手動 build を打つ場合
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_CRON_SECRET_VERSION=2 \
  --project="${PROJECT_ID}"
```

ローリング切替中は旧リビジョン（旧 secret）と新リビジョン（新 secret）が併存する。Cloud Scheduler は **まだ旧値** を送るため、ローリング窓中は新リビジョンへの cron 呼び出しが 401 になり得る。Cloud Scheduler 側の retry（`--max-retry-attempts=3 --min-backoff=30s`）で吸収されるが、心配なら Step 3 を Step 2 完了直後に即実行する。

### 3. Cloud Scheduler を再 upsert（新値で header を再焼き込み）

```bash
export PROJECT_ID="<your-project>"
export SERVICE_URL="https://<your-cloud-run-url>"
# CRON_SECRET 未設定なら setup-cloud-scheduler.sh が gcloud secrets versions access latest で自動取得
bash scripts/setup-cloud-scheduler.sh
```

スクリプトは全 cron ジョブを `update` で再登録し、新値の `Authorization: Bearer <CRON_SECRET>` を全 8 ジョブに焼き直す。**`latest` を取得するため、Step 1 で新 version を追加済みであれば自動で新値が反映される**。

### 4. 動作確認

- Cloud Scheduler コンソールで各ジョブの「強制実行」を 1 回ずつ実行（または `gcloud scheduler jobs run <name> --location=asia-northeast1`）
- Cloud Run ログで `401 Unauthorized` が出ていないことを確認
- 主要 cron（reservation-reminder、calendar-sync、event-import）の通常起動を 1 周期分待ち、成功ログを確認

### 5. 旧 secret version を disable

新版で全 cron が安定動作することを確認したら、旧 version を `disabled` にする（削除は不可逆なので一定期間保持してから destroy）。

```bash
# Step 1 で追加した新 version 以外の最新を disable
gcloud secrets versions disable <旧 version 番号> \
  --secret=CRON_SECRET \
  --project="${PROJECT_ID}"

# 数週間運用後、問題なければ destroy（不可逆）
gcloud secrets versions destroy <旧 version 番号> \
  --secret=CRON_SECRET \
  --project="${PROJECT_ID}"
```

## Rollback 手順

Step 2 の redeploy 後に cron が大量 401 を出している、または cron 実行が失敗している場合:

### A. cloudbuild substitution を旧 version に戻す（短時間で復旧）

```yaml
# cloudbuild.yaml
substitutions:
  _CRON_SECRET_VERSION: "1" # 旧 version へ revert
```

revert commit を merge して redeploy。Cloud Scheduler が `latest`（新 version）を持っている場合は、続けて旧値で再 upsert する:

```bash
# 一時的に CRON_SECRET を旧値で上書きして setup-cloud-scheduler.sh を実行
export CRON_SECRET=$(gcloud secrets versions access 1 \
  --secret=CRON_SECRET --project="${PROJECT_ID}")
bash scripts/setup-cloud-scheduler.sh
```

### B. Cloud Run 即時 rollback（cloudbuild redeploy を待たない）

```bash
# 直前の安定 revision に traffic 100% を即切替
gcloud run services update-traffic <service-name> \
  --to-revisions=<前回 revision>=100 \
  --region=asia-northeast1 \
  --project="${PROJECT_ID}"
```

旧 revision は旧 secret version を mount しているため、Cloud Scheduler 側の値も旧値に戻すこと（Step A の最後のコマンド参照）。

## 緊急ローテーション（漏洩時）

旧値が compromised の疑いがある場合:

1. Step 1 を即実施（新 version 追加）
2. Step 2 で cloudbuild substitution を即 bump → redeploy（ローリング切替の旧 revision の旧 secret 露出を最小化したい場合は `gcloud run services update-traffic --to-latest=100` で新 revision に traffic 全振り後、旧 revision を `gcloud run revisions delete` で削除）
3. Step 3 で Cloud Scheduler を即再 upsert
4. Step 5 で旧 version を **`disable` ではなく直接 `destroy`** して値の物理消去（destroy は 30 日後に物理削除、それまでは recover 可能。漏洩源を確実に潰すなら 30 日後に再確認）
5. GCP の Audit Log で旧 secret version への `AccessSecretVersion` を全件確認（不審なアクセスがあれば追加対応）

## 影響範囲とリスク

- **影響を受ける**: `/api/cron/*` 全 8 エンドポイント（[`scripts/setup-cloud-scheduler.sh`](../../scripts/setup-cloud-scheduler.sh) の `JOBS` 配列が SSoT）
- **影響を受けない**: HTTP request 認証以外の cron 内ロジック（DB / R2 / 外部 API）。`CRON_SECRET` は HTTP 認可トークンのみで at-rest 暗号には未使用
- **致命的なリスク**:
  - Step 2（Cloud Run 新値 mount）と Step 3（Cloud Scheduler 新値送信）の時間差で全 cron が 401 連発 → Cloud Scheduler の retry で吸収されるが、長時間放置すると `reservation-reminder` の遅延などビジネス影響が出る
  - Step 5 を Step 4 確認前に走らせ、旧 version を disable した直後に rollback が必要になると secret 取得不可で復旧難航 → **必ず Step 4 確認後に Step 5**
- **Cloud Scheduler 限定リスク**: スクリプトは `gcloud secrets versions access latest` で取得するため、Step 1 で誤った値を `latest` に push すると Step 3 で間違った値が焼き込まれる。Step 1 直後に `gcloud secrets versions access latest --secret=CRON_SECRET` で値を目視確認する

## 検証

- [`__tests__/unit/api/cron-reservation-reminder.test.ts`](../../__tests__/unit/api/cron-reservation-reminder.test.ts) が `authorizeCronRequest` の 401 / 200 分岐を担保
- ローテーション手順変更時は本 runbook と [`scripts/setup-cloud-scheduler.sh`](../../scripts/setup-cloud-scheduler.sh) の `JOBS` 配列を併せて更新
