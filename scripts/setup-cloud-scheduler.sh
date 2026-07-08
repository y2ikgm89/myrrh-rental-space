#!/usr/bin/env bash
# =============================================================================
# Cloud Scheduler セットアップスクリプト（idempotent）
# =============================================================================
#
# 本スクリプトは Myrrh Rental Space の全 cron エンドポイントを Cloud Scheduler
# に一括登録する。存在するジョブは `update`、存在しないジョブは `create` する
# 冪等スクリプト。何度実行しても安全。
#
# 認証方式: Cloud Scheduler OIDC token
#   - `--oidc-service-account-email` で指定した service account から
#     Authorization: Bearer <Google ID token> が生成される
#   - アプリ側は token の audience と service account email を検証する
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
#   CRON_SERVICE_ACCOUNT_EMAIL  OIDC token 発行元 service account（必須）
#   CRON_OIDC_AUDIENCE          OIDC audience（デフォルト: SERVICE_URL）
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
: "${CRON_SERVICE_ACCOUNT_EMAIL:?CRON_SERVICE_ACCOUNT_EMAIL is required}"
REGION="${REGION:-asia-northeast1}"
TIME_ZONE="${TIME_ZONE:-Asia/Tokyo}"
CRON_OIDC_AUDIENCE="${CRON_OIDC_AUDIENCE:-${SERVICE_URL}}"
DRY_RUN="${DRY_RUN:-0}"

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
  "event-reminder|0 * * * *|/api/cron/event-reminder|Event reminder email dispatch (hourly, opt-in via Settings.notifyEventReminder)"
)

# --- ヘルパー ---------------------------------------------------------------

run_gcloud() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY RUN] gcloud $*"
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

  local header_args=()
  if [[ "${action}" == "update" ]]; then
    header_args+=(--clear-headers)
  fi

  run_gcloud scheduler jobs "${action}" http "${name}" \
    --quiet \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --schedule="${schedule}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${uri}" \
    --http-method=GET \
    "${header_args[@]}" \
    --oidc-service-account-email="${CRON_SERVICE_ACCOUNT_EMAIL}" \
    --oidc-token-audience="${CRON_OIDC_AUDIENCE}" \
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
echo "  Audience:  ${CRON_OIDC_AUDIENCE}"
echo "  OIDC SA:   ${CRON_SERVICE_ACCOUNT_EMAIL}"
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
