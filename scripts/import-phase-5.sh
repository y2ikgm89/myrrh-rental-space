#!/usr/bin/env bash
# =============================================================================
# Phase 5 (WIF Pool/Provider) → Terraform state import
# =============================================================================
#
# 既存の WIF Pool + Provider を Terraform 管理下に取り込む。
# terraform apply 前に project owner が 1 度だけ実行。
#
# ## 2026-07-14 F1 refactor 以降の変更点
#
# 過去はここで 4 SA (runtime / build / scheduler / terraform_runner) と
# project-level IAM を import していたが、`terraform/service_accounts.tf` +
# `terraform/iam_project.tf` + `terraform/secret_iam.tf` を bootstrap の SSoT に
# 集約し (bootstrap-owns-all-project-IAM 契約)、Terraform 側の宣言を全廃した。
# ゆえに SA metadata と project-level IAM の import は不要 (state 内に該当
# resource がなくなった)。
#
# 本 script は WIF Pool + Provider のみを import する。
#
# ## 前提
#   - Terraform 1.10+
#   - Phase 1-4 が既に merge 済 (順序性)
#   - `bash scripts/bootstrap-terraform.sh` 実行済 (SA metadata + project-level
#     IAM は bootstrap の SSoT)
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-phase-5.sh
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

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
echo "[import-phase-5]  - If WIF attribute mapping differs, adjust wif.tf."
echo "[import-phase-5]  - SA metadata / project-level IAM は bootstrap の SSoT (import 不要)."
