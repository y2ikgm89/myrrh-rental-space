#!/usr/bin/env bash
# =============================================================================
# Phase 6 (Cloud Run services + Job + resource-scoped IAM) → Terraform state import
# =============================================================================
#
# Cloud Run public/admin service + prisma-migrate Job + Cloud Run/Artifact
# Registry の resource-scoped IAM を state に取り込む。terraform apply 前に
# project owner が 1 度だけ実行。
#
# ⚠️  最要注意 Phase: import 後の `terraform plan` は Cloud Run resource で
# 大量の差分が出ることが予想される (Cloud Run v2 API は attribute が多く、
# 完全に一致させるには HCL 側で実測値を書き写す必要)。差分を精査し、
# `terraform apply` が Cloud Run revision を破壊しないことを確認するまで
# main へ merge しないこと。
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-phase-6.sh
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
REGION="${REGION:-asia-northeast1}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

echo "[import-phase-6] Project: ${PROJECT_ID}"
echo "[import-phase-6] Region:  ${REGION}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  terraform init -input=false >/dev/null
fi

import_one() {
  local addr="$1"
  local id="$2"
  echo "[import-phase-6] ${addr} ← ${id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import-phase-6][DRY_RUN] terraform import %q %q\n' "${addr}" "${id}"
    return 0
  fi
  if terraform state show "${addr}" >/dev/null 2>&1; then
    echo "[import-phase-6]   already in state — skipping"
    return 0
  fi
  terraform import -input=false "${addr}" "${id}"
}

# Cloud Run services
import_one \
  "google_cloud_run_v2_service.public" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space"

import_one \
  "google_cloud_run_v2_service.admin" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space-admin"

# Cloud Run Job
import_one \
  "google_cloud_run_v2_job.prisma_migrate" \
  "projects/${PROJECT_ID}/locations/${REGION}/jobs/prisma-migrate"

# Cloud Run IAM (allUsers on public / build SA on services / scheduler SA on public)
import_one \
  "google_cloud_run_v2_service_iam_member.public_allow_unauthenticated" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space roles/run.invoker allUsers"

import_one \
  "google_cloud_run_v2_service_iam_member.build_sa_public_admin" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space roles/run.admin serviceAccount:myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"

import_one \
  "google_cloud_run_v2_service_iam_member.build_sa_admin_admin" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space-admin roles/run.admin serviceAccount:myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"

import_one \
  "google_cloud_run_v2_service_iam_member.scheduler_sa_public_invoker" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/myrrh-rental-space roles/run.invoker serviceAccount:myrrh-rental-space-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

# Cloud Run Job IAM
import_one \
  "google_cloud_run_v2_job_iam_member.build_sa_migrate_admin" \
  "projects/${PROJECT_ID}/locations/${REGION}/jobs/prisma-migrate roles/run.admin serviceAccount:myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"

# Runtime SA impersonation for build SA
import_one \
  "google_service_account_iam_member.build_sa_uses_runtime_sa" \
  "projects/${PROJECT_ID}/serviceAccounts/myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com roles/iam.serviceAccountUser serviceAccount:myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"

# Artifact Registry: build SA writer
import_one \
  "google_artifact_registry_repository_iam_member.build_sa_docker_writer" \
  "projects/${PROJECT_ID}/locations/${REGION}/repositories/myrrh-rental-space roles/artifactregistry.writer serviceAccount:myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"

popd >/dev/null

echo "[import-phase-6] done."
echo "[import-phase-6]  - ⚠️  Run 'cd ${TF_DIR} && terraform plan' — expect DIFFERENCES on Cloud Run resources."
echo "[import-phase-6]  - Do NOT merge Phase 6 PR until plan drift is understood and the diff will not"
echo "[import-phase-6]    destroy any active revision. Add ignore_changes as needed."
