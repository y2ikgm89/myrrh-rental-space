#!/usr/bin/env bash
# =============================================================================
# Terraform 運用の bootstrap セットアップ (idempotent、1 度だけ project owner が実行)
# =============================================================================
#
# 本スクリプトは terraform apply が GitHub Actions 上で動くための前提を作る:
#
#   1. GCS bucket (Terraform state 保存先、versioning ON)
#   2. terraform-runner service account
#   3. GCS bucket への runner SA の書込許可 (最小権限、bucket 単位)
#   4. Workload Identity Federation binding (既存 pool `github-actions` を再利用)
#   5. terraform-runner SA への project-level roles の bootstrap grant
#      (conditions.tf が再宣言する各 role を最初の apply が通せるようにする
#      chicken-egg 対策; Codex P1 #1063 follow-up)
#
# IAM Deny Policy (Codex P1 対策) と IAM Conditions は terraform/deny.tf /
# conditions.tf に定義され、apply で反映される。本スクリプトの責務は state
# backend と runner SA、そして最初の terraform apply が自分自身の IAM
# bindings を宣言できるようにするための bootstrap grant (self-manage handoff)。
#
# ## bootstrap → self-manage handoff
# ステップ 5 で付ける role は conditions.tf に 1:1 で対応する。terraform apply が
# 通ると同じ member+role が再宣言されるため idempotent (bootstrap 再実行も no-op、
# terraform 側の drift 削除もされない)。conditions.tf に role が増えた場合は
# 本スクリプトにも追記する (両方揃わないと fresh project の初回 apply が落ちる)。
#
# ## 前提
#   - gcloud CLI 認証済み (`gcloud auth login`)、project owner 相当の権限が必要
#   - WIF pool `github-actions` は既に構築されている
#     (docs/gcp-production-setup.md 参照)
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/bootstrap-terraform.sh
#
# ## 環境変数
#   PROJECT_ID       GCP プロジェクト ID (必須)
#   PROJECT_NUMBER   自動取得 (gcloud projects describe から)
#   REGION           default: asia-northeast1
#   STATE_BUCKET     default: ${PROJECT_ID}-terraform-state
#   TERRAFORM_SA     default: terraform-runner@${PROJECT_ID}.iam.gserviceaccount.com
#   WIF_POOL_ID      default: github-actions
#   GITHUB_REPO      default: y2ikgm89/myrrh-rental-space
#   DRY_RUN          "1" 指定時は gcloud コマンドを出力するだけで実行しない
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
: "${PROJECT_NUMBER:=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')}"
REGION="${REGION:-asia-northeast1}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT_ID}-terraform-state}"
TERRAFORM_SA="${TERRAFORM_SA:-terraform-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
WIF_POOL_ID="${WIF_POOL_ID:-github-actions}"
GITHUB_REPO="${GITHUB_REPO:-y2ikgm89/myrrh-rental-space}"
DRY_RUN="${DRY_RUN:-0}"

echo "[bootstrap] Project:              ${PROJECT_ID} (number ${PROJECT_NUMBER})"
echo "[bootstrap] State bucket:         gs://${STATE_BUCKET}"
echo "[bootstrap] Terraform runner SA:  ${TERRAFORM_SA}"
echo "[bootstrap] WIF pool:             ${WIF_POOL_ID}"
echo "[bootstrap] GitHub repo:          ${GITHUB_REPO}"

run() {
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[bootstrap][DRY_RUN] '
    printf '%s ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# 1. GCS state bucket (idempotent)
if [ "${DRY_RUN}" != "1" ] \
   && gcloud storage buckets describe "gs://${STATE_BUCKET}" \
        --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap] State bucket exists — skipping create"
else
  echo "[bootstrap] Creating state bucket"
  run gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

# 破壊 / 履歴保存のため versioning を有効化
run gcloud storage buckets update "gs://${STATE_BUCKET}" \
  --project="${PROJECT_ID}" \
  --versioning

# 2. Terraform runner SA (idempotent)
if [ "${DRY_RUN}" != "1" ] \
   && gcloud iam service-accounts describe "${TERRAFORM_SA}" \
        --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap] Terraform runner SA exists — skipping create"
else
  echo "[bootstrap] Creating Terraform runner SA"
  run gcloud iam service-accounts create terraform-runner \
    --project="${PROJECT_ID}" \
    --display-name="Terraform runner (GitHub Actions)"
fi

# 3. state bucket への Terraform runner の書込許可 (最小権限、bucket 単位)
echo "[bootstrap] Granting runner SA storage.objectAdmin on state bucket"
run gcloud storage buckets add-iam-policy-binding "gs://${STATE_BUCKET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/storage.objectAdmin"

# 4. Workload Identity Federation binding
#    既存 pool "github-actions" を再利用し、GitHub Actions が
#    terraform-runner SA を impersonate できるようにする。
echo "[bootstrap] Binding WIF principalSet to Terraform runner SA"
run gcloud iam service-accounts add-iam-policy-binding "${TERRAFORM_SA}" \
  --project="${PROJECT_ID}" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
  --role="roles/iam.workloadIdentityUser"

# 5. Project-level roles bootstrap grant (chicken-egg 対策)
#    conditions.tf は runner SA に project-level bindings を宣言するが、それを
#    apply するための IAM 変更権限が最初は無い。ここで同じ member+role を
#    bootstrap で先付けする。terraform apply は同じ binding を再宣言するので
#    idempotent (drift も no-op)。conditions.tf 側にしか無い binding があると
#    fresh project の最初の apply が Permission denied で落ちる。
#
#    Conditional projectIamAdmin (conditions.tf L17-27 と 1:1):
#      modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']
#    により runner が他 role を self-grant する経路は封じる。
echo "[bootstrap] Granting runner SA conditional projectIamAdmin (Terraform self-manage 用)"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/resourcemanager.projectIamAdmin" \
  --condition="expression=api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly(['roles/secretmanager.secretAccessor']),title=only_grant_secretmanager_secretAccessor,description=Restrict grantable roles to Secret Manager secretAccessor only (privilege escalation guard, Codex P1 #1053)"

# conditions.tf の他 project-level roles を同期。role 追加時は両方を更新すること。
BOOTSTRAP_RUNNER_ROLES="\
roles/cloudscheduler.admin \
roles/secretmanager.admin \
roles/artifactregistry.admin \
roles/cloudbuild.workerPoolOwner \
roles/iam.serviceAccountAdmin \
roles/iam.workloadIdentityPoolAdmin \
roles/run.admin \
roles/compute.networkAdmin \
roles/compute.securityAdmin \
roles/iap.admin \
"
for role in ${BOOTSTRAP_RUNNER_ROLES}; do
  echo "[bootstrap] Granting runner SA ${role}"
  run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${TERRAFORM_SA}" \
    --role="${role}" \
    --condition=None
done

echo "[bootstrap] done."
echo "[bootstrap]  - Terraform state bucket, runner SA, WIF binding, and bootstrap"
echo "[bootstrap]    project-level roles are ready."
echo "[bootstrap]  - Deny Policy + IAM Conditions on the runner SA will be applied by"
echo "[bootstrap]    the next terraform apply (via GitHub Actions on merge to main),"
echo "[bootstrap]    which idempotently re-declares the same bindings under conditions.tf."
echo "[bootstrap]  - Add or modify secrets via a PR that edits terraform/secret_iam.tf."
