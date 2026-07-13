#!/usr/bin/env bash
# =============================================================================
# Phase 4 (Artifact Registry + Cloud Build worker pool) → Terraform state import
# =============================================================================
#
# 既存の Docker repository と private worker pool を Terraform 管理下に取り込む。
# terraform apply 前に project owner が 1 度だけ実行。
#
# ## 前提
#   - Terraform 1.10+
#   - `bash scripts/bootstrap-terraform.sh` 実行済
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-phase-4.sh
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
REGION="${REGION:-asia-northeast1}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

DOCKER_REPO="myrrh-rental-space"
WORKER_POOL="myrrh-deploy-pool"

echo "[import-phase-4] Project:     ${PROJECT_ID}"
echo "[import-phase-4] Region:      ${REGION}"
echo "[import-phase-4] Docker repo: ${DOCKER_REPO}"
echo "[import-phase-4] Worker pool: ${WORKER_POOL}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  terraform init -input=false >/dev/null
fi

import_one() {
  local addr="$1"
  local id="$2"
  echo "[import-phase-4] ${addr} ← ${id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import-phase-4][DRY_RUN] terraform import %q %q\n' "${addr}" "${id}"
    return 0
  fi
  if terraform state show "${addr}" >/dev/null 2>&1; then
    echo "[import-phase-4]   already in state — skipping"
    return 0
  fi
  terraform import -input=false "${addr}" "${id}"
}

import_one \
  "google_artifact_registry_repository.docker" \
  "projects/${PROJECT_ID}/locations/${REGION}/repositories/${DOCKER_REPO}"

import_one \
  "google_cloudbuild_worker_pool.deploy_pool" \
  "projects/${PROJECT_ID}/locations/${REGION}/workerPools/${WORKER_POOL}"

popd >/dev/null

echo "[import-phase-4] done."
echo "[import-phase-4]  - Run 'cd ${TF_DIR} && terraform plan' and verify 'No changes'."
echo "[import-phase-4]  - If plan shows differences on the worker pool, adjust"
echo "[import-phase-4]    terraform/cloud_build_worker_pool.tf attributes to match."
