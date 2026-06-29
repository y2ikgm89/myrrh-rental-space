#!/usr/bin/env bash
# =============================================================================
# Cloud Scheduler セットアップスクリプト（idempotent）
# =============================================================================
#
# 本スクリプトは Myrrh Rental Space の全 cron エンドポイントを Cloud Scheduler
# に一括登録する。存在するジョブは `update`、存在しないジョブは `create` する
# 冪等スクリプト。何度実行しても安全。
#
# 認証方式: Authorization: Bearer $CRON_SECRET (Secret Manager から取得)
#   - GCP OIDC トークンではなく、既存の `authorizeCronRequest` パターン準拠
#   - 外部ポーリング（例: cron-job.org）との互換性維持
#
# 使い方:
#   1. gcloud CLI 認証済み (`gcloud auth login`)
#   2. PROJECT_ID と SERVICE_URL を設定（環境変数 or 引数）
#   3. `bash scripts/setup-cloud-scheduler.sh`
#
# 環境変数:
#   PROJECT_ID       GCP プロジェクト ID（必須）
#   SERVICE_URL      Cloud Run サービス URL（必須）例: https://myrrh-rental-space-xxx.a.run.app
#   REGION           Cloud Scheduler リージョン（デフォルト: asia-northeast1）
#   TIME_ZONE        Cron タイムゾーン（デフォルト: Asia/Tokyo）
#   CRON_SECRET      Cron 認証トークン（Secret Manager から取得推奨）
#   DRY_RUN          "1" 指定時は gcloud コマンドを出力するだけで実行しない
#
# 参考:
#   - Cloud Scheduler HTTP Target: https://docs.cloud.google.com/scheduler/docs/http-target-auth
#   - cron syntax: https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules
# =============================================================================

set -euo pipefail

# --- 設定 ------------------------------------------------------------------

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${SERVICE_URL:?SERVICE_URL is required (e.g., https://myrrh-rental-space-xxx.a.run.app)}"
REGION="${REGION:-asia-northeast1}"
TIME_ZONE="${TIME_ZONE:-Asia/Tokyo}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "⚠️  CRON_SECRET not set in environment. Fetching from Secret Manager..."
  CRON_SECRET=$(gcloud secrets versions access latest \
    --secret=CRON_SECRET \
    --project="${PROJECT_ID}") || {
    echo "❌ Failed to fetch CRON_SECRET from Secret Manager" >&2
    exit 1
  }
fi

# --- ジョブ定義 ------------------------------------------------------------
#
# フォーマット: "<name>|<schedule>|<path>|<description>"
#   name:        Cloud Scheduler ジョブ名（半角英数字ハイフン）
#   schedule:    標準 cron 式（TIME_ZONE に従って解釈）
#   path:        Cloud Run 内の HTTP パス（/api/cron/... で始まる）
#   description: 運用者向け説明

JOBS=(
  "calendar-sync|*/10 * * * *|/api/cron/calendar-sync|Google Calendar bi-directional sync (poll every 10 min)"
  "event-import|0 * * * *|/api/cron/event-import|GCal event import into Event model (hourly)"
  "faq-trash-cleanup|0 3 * * *|/api/cron/faq-trash-cleanup|FAQ recycle bin 30-day auto-purge (daily 03:00 JST)"
  "faq-stale-check|0 9 * * 1|/api/cron/faq-stale-check|Weekly stale FAQ notification (Mon 09:00 JST)"
  "instagram-refresh|0 2 * * *|/api/cron/instagram-refresh|Instagram long-lived token refresh (daily 02:00 JST)"
  "instagram-sync|*/30 * * * *|/api/cron/instagram-sync|Instagram feed sync (every 30 min)"
  "notification-cleanup|0 4 * * *|/api/cron/notification-cleanup|Old notification cleanup 30d+ (daily 04:00 JST)"
  "reservation-reminder|0 * * * *|/api/cron/reservation-reminder|Reservation reminder email dispatch (hourly)"
)

# --- ヘルパー ---------------------------------------------------------------

run_gcloud() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    local redacted_args=()
    local arg
    for arg in "$@"; do
      if [[ "${arg}" == --headers=Authorization=Bearer* ]]; then
        redacted_args+=("--headers=Authorization=Bearer [REDACTED]")
      else
        redacted_args+=("${arg}")
      fi
    done
    echo "[DRY RUN] gcloud ${redacted_args[*]}"
  else
    gcloud "$@"
  fi
}

job_exists() {
  local name="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 1
  fi

  gcloud scheduler jobs describe "${name}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    &>/dev/null
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local path="$3"
  local description="$4"
  local uri="${SERVICE_URL}${path}"
  local action="create"

  if job_exists "${name}"; then
    action="update"
  fi

  echo "▶ ${action}: ${name} (${schedule}) → ${path}"

  run_gcloud scheduler jobs "${action}" http "${name}" \
    --quiet \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --schedule="${schedule}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${uri}" \
    --http-method=GET \
    --headers="Authorization=Bearer ${CRON_SECRET}" \
    --attempt-deadline=300s \
    --max-retry-attempts=3 \
    --min-backoff=30s \
    --max-backoff=600s \
    --description="${description}" \
    --format="value(name)"
}

# --- 実行 ------------------------------------------------------------------

echo "🔧 Cloud Scheduler セットアップ開始"
echo "  Project:   ${PROJECT_ID}"
echo "  Region:    ${REGION}"
echo "  TimeZone:  ${TIME_ZONE}"
echo "  Service:   ${SERVICE_URL}"
echo "  Dry run:   ${DRY_RUN}"
echo ""

for job_def in "${JOBS[@]}"; do
  IFS='|' read -r name schedule path description <<< "${job_def}"
  upsert_job "${name}" "${schedule}" "${path}" "${description}"
done

echo ""
echo "✅ Cloud Scheduler セットアップ完了（${#JOBS[@]} ジョブ）"
echo ""
echo "📋 登録済みジョブ一覧:"
if [[ "${DRY_RUN}" != "1" ]]; then
  gcloud scheduler jobs list \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="table(name.segment(-1),schedule,timeZone,state)"
fi
