#!/usr/bin/env bash
# =============================================================================
# Phase 5 (Service Accounts + WIF Pool/Provider) → Terraform state import
# =============================================================================
#
# 既存の 4 SA と WIF Pool + Provider を Terraform 管理下に取り込む。
# terraform apply 前に project owner が 1 度だけ実行。
#
# project-level IAM bindings (google_project_iam_member.* in iam_project.tf) は
# non-authoritative なので import 不要 (存在 binding は Terraform apply が
# 冪等に確認する)。
#
# ## 前提
#   - Terraform 1.10+
#   - Phase 1-4 が既に merge 済 (順序性)
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-phase-5.sh
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

SERVICE_ACCOUNTS=(
  "runtime|myrrh-rental-space-runtime"
  "build|myrrh-rental-space-build"
  "scheduler|myrrh-rental-space-scheduler"
  "terraform_runner|terraform-runner"
)

WIF_POOL_ID="github-actions"
WIF_PROVIDER_ID="github-myrrh-rental-space"

echo "[import-phase-5] Project: ${PROJECT_ID}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  terraform init -input=false >/dev/null
fi

import_one() {
  local addr="$1"
  local id="$2"
  echo "[import-phase-5] ${addr} ← ${id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import-phase-5][DRY_RUN] terraform import %q %q\n' "${addr}" "${id}"
    return 0
  fi
  if terraform state show "${addr}" >/dev/null 2>&1; then
    echo "[import-phase-5]   already in state — skipping"
    return 0
  fi
  terraform import -input=false "${addr}" "${id}"
}

# Service Accounts (map key : account_id)
for entry in "${SERVICE_ACCOUNTS[@]}"; do
  key="${entry%%|*}"
  account_id="${entry##*|}"
  import_one \
    "google_service_account.sa[\"${key}\"]" \
    "projects/${PROJECT_ID}/serviceAccounts/${account_id}@${PROJECT_ID}.iam.gserviceaccount.com"
done

# WIF Pool
import_one \
  "google_iam_workload_identity_pool.github_actions" \
  "projects/${PROJECT_ID}/locations/global/workloadIdentityPools/${WIF_POOL_ID}"

# WIF Provider
import_one \
  "google_iam_workload_identity_pool_provider.github" \
  "projects/${PROJECT_ID}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"

popd >/dev/null

echo "[import-phase-5] done."
echo "[import-phase-5]  - Run 'cd ${TF_DIR} && terraform plan' and verify 'No changes'."
echo "[import-phase-5]  - If SA display_name / description differ, adjust service_accounts.tf."
echo "[import-phase-5]  - If WIF attribute mapping differs, adjust wif.tf."
