#!/usr/bin/env bash
# =============================================================================
# Cloud Scheduler existing jobs → Terraform state import (Phase 2 bootstrap)
# =============================================================================
#
# scripts/setup-cloud-scheduler.sh (Phase 2 で削除) が gcloud で作成した既存
# Cloud Scheduler jobs を Terraform state に取り込む。terraform apply 前に
# project owner が 1 度だけ実行 (idempotent)。以後は terraform/cloud_scheduler.tf
# が SSoT。
#
# 実行後 `terraform plan` が「変更なし」で終わることを確認してから main へ
# merge する。
#
# ## 前提
#   - Terraform 1.10+ がローカルにインストール済 or `bunx terraform` が動く
#   - `bash scripts/bootstrap-terraform.sh` を先に実行済 (state bucket, runner SA)
#   - gcloud CLI 認証済み (project owner)
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-cloud-scheduler.sh
#
# ## 環境変数
#   PROJECT_ID   GCP プロジェクト ID (必須)
#   REGION       default: asia-northeast1
#   TF_DIR       default: terraform (Terraform 設定のディレクトリ)
#   DRY_RUN      "1" 指定時は terraform import コマンドを出力するだけで実行しない
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
REGION="${REGION:-asia-northeast1}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

JOBS=(
  calendar-sync
  event-import
  faq-trash-cleanup
  faq-stale-check
  customer-risk-scan
  instagram-refresh
  instagram-sync
  notification-cleanup
  reservation-reminder
  event-reminder
  smart-lock-cleanup
  pending-reservation-expire
  data-retention
)

echo "[import] Project: ${PROJECT_ID}"
echo "[import] Region:  ${REGION}"
echo "[import] Jobs:    ${#JOBS[@]}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  echo "[import] terraform init"
  terraform init -input=false >/dev/null
fi

for job in "${JOBS[@]}"; do
  resource_addr="google_cloud_scheduler_job.job[\"${job}\"]"
  resource_id="projects/${PROJECT_ID}/locations/${REGION}/jobs/${job}"
  echo "[import] ${resource_addr} ← ${resource_id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import][DRY_RUN] terraform import %q %q\n' "${resource_addr}" "${resource_id}"
    continue
  fi
  # 既に state に入っている場合は skip
  if terraform state show "${resource_addr}" >/dev/null 2>&1; then
    echo "[import]   already in state — skipping"
    continue
  fi
  terraform import -input=false "${resource_addr}" "${resource_id}"
done

popd >/dev/null

echo "[import] done."
echo "[import]  - Run 'cd ${TF_DIR} && terraform plan' and verify 'No changes'."
echo "[import]  - Then merge the Phase 2 PR to hand over ownership to Terraform."
