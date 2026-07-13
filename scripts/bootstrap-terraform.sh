#!/usr/bin/env bash
# =============================================================================
# Terraform 運用の bootstrap セットアップ (idempotent、project owner が実行)
# =============================================================================
#
# 本スクリプトは Terraform runner SA の **project-level IAM の唯一の SSoT**。
# Terraform 側は runner 自身の bindings を宣言しない (2026-07-14 refactor)。
#
# ## Runner IAM 所有モデル (bootstrap-only 契約)
#
# 過去は "bootstrap でも Terraform でも同じ binding を宣言 = dual SSoT" の
# 構成だったが、これは 2 つの問題を持っていた:
#
#   - F8 chicken-egg: 新規 role を追加した瞬間、runner に該当 permission が
#     まだ無い状態で apply が走ると Permission denied。
#   - Codex P1 D1 fallout: `projectIamAdmin` に conditional 制約
#     (`modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']`)
#     が付いているため、runner は自分自身の bindings を再宣言する
#     SetIamPolicy 呼び出しさえ通せない (即 403)。
#
# 公式 Google 推奨 (cloud.google.com/architecture/setup-terraform-cicd,
# FAST 0-org-setup, terraform-google-bootstrap) は "runner authority は
# out-of-band で provision し、Terraform は downstream infra だけを管理する"。
# 本スクリプトはその原則に沿い、runner の全 project-level IAM を bootstrap
# に集約する (break-glass は project.owner が本スクリプトを再実行、または
# gcloud を直接叩く)。
#
# 本スクリプトが構成する項目:
#
#   1. GCS bucket (Terraform state 保存先、versioning ON)
#   2. terraform-runner service account
#   3. GCS bucket への runner SA の書込許可 (最小権限、bucket 単位)
#   4. Workload Identity Federation binding (既存 pool `github-actions` を再利用)
#   5. terraform-runner SA への conditional projectIamAdmin (A1)
#   6. Secret Manager custom role `terraformRunnerSecretManagerNoPolicyMgmt` の
#      create/update (D1、setIamPolicy / getIamPolicy を除外して F1 self-grant 経路を封鎖)
#   7. custom role の runner SA への grant (A3)
#   8. 残りの predefined roles (A2 / A4-A12) の grant
#
# IAM Deny Policy (Codex P1 対策) は `terraform/deny.tf` に定義され、apply で
# 反映される (denyAdmin 権限は本スクリプトが bootstrap 済みなので runner が
# refresh できる)。
#
# ## 追加 role の運用手順
#
# 新規 role を runner に付けたい場合は本スクリプトの `BOOTSTRAP_RUNNER_ROLES`
# か個別ブロックに追記し、本スクリプトを再実行する (idempotent)。Terraform 側の
# 追記は不要 (というより禁止 — dual SSoT を再導入すると F8 が再発する)。
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

# 5. Conditional projectIamAdmin (A1)
#    runner が secret_iam.tf の `roles/secretmanager.secretAccessor` を
#    runtime SA / build SA へ project-level で付けるのに必要。CEL condition
#    `modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']` で
#    grantable role を secretAccessor のみに絞り、runner が他 role を
#    self-grant する経路を封じる (privilege escalation guard, Codex P1 #1053)。
#
#    projectIamAdmin は今や本 binding が唯一の runner での用途 — runner の
#    それ以外の project-level bindings は「自分自身への grant」なので、そもそも
#    Terraform で self-declare しない (2026-07-14 bootstrap-only refactor)。
echo "[bootstrap] Granting runner SA conditional projectIamAdmin (secretAccessor grant 用)"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/resourcemanager.projectIamAdmin" \
  --condition="expression=api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly(['roles/secretmanager.secretAccessor']),title=only_grant_secretmanager_secretAccessor,description=Restrict grantable roles to Secret Manager secretAccessor only (privilege escalation guard, Codex P1 #1053)"

# 6. Secret Manager custom role (D1) - idempotent create/update
#    過去は terraform/conditions.tf の `google_project_iam_custom_role` で
#    宣言していたが、runner に `iam.roles.create` が無いため fresh apply で
#    F8 chicken-egg が発生。bootstrap-only 契約に従い bootstrap 側の SSoT に
#    移管。permissions は Terraform 版と厳密一致 (setIamPolicy / getIamPolicy
#    を除外して F1 self-grant を封鎖、GA stage)。
#
#    permissions list (12 個):
#      - secret metadata CRUD (5): create/delete/get/list/update
#      - version 管理 (6): versions.add/destroy/disable/enable/get/list
#      - provider refresh (1): resourcemanager.projects.get
#    含まれない:
#      - secretmanager.secrets.setIamPolicy / getIamPolicy (F1 self-grant guard)
#      - secretmanager.versions.access (deny.tf が二重封鎖)
CUSTOM_ROLE_ID="terraformRunnerSecretManagerNoPolicyMgmt"
CUSTOM_ROLE_PERMISSIONS="secretmanager.secrets.create,secretmanager.secrets.delete,secretmanager.secrets.get,secretmanager.secrets.list,secretmanager.secrets.update,secretmanager.versions.add,secretmanager.versions.destroy,secretmanager.versions.disable,secretmanager.versions.enable,secretmanager.versions.get,secretmanager.versions.list,resourcemanager.projects.get"
CUSTOM_ROLE_TITLE="TF Runner Secret Manager (no IAM policy mgmt)"
CUSTOM_ROLE_DESCRIPTION="Closes Codex P1 F1: compromised runner otherwise grants secretAccessor to attacker-controlled principal via per-secret SetIamPolicy, bypassing deny.tf."

if [ "${DRY_RUN}" != "1" ] \
   && gcloud iam roles describe "${CUSTOM_ROLE_ID}" \
        --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap] Custom role ${CUSTOM_ROLE_ID} exists — updating (permissions drift check)"
  run gcloud iam roles update "${CUSTOM_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${CUSTOM_ROLE_TITLE}" \
    --description="${CUSTOM_ROLE_DESCRIPTION}" \
    --permissions="${CUSTOM_ROLE_PERMISSIONS}" \
    --stage=GA
else
  echo "[bootstrap] Creating custom role ${CUSTOM_ROLE_ID}"
  run gcloud iam roles create "${CUSTOM_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${CUSTOM_ROLE_TITLE}" \
    --description="${CUSTOM_ROLE_DESCRIPTION}" \
    --permissions="${CUSTOM_ROLE_PERMISSIONS}" \
    --stage=GA
fi

# 7. Custom role → runner SA の grant (A3)
#    Secret Manager metadata / version 管理を runner に委ねる。
echo "[bootstrap] Granting runner SA custom role ${CUSTOM_ROLE_ID}"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}" \
  --condition=None

# 8. 残りの predefined roles (A2 / A4-A12) の grant
#    - roles/iam.denyAdmin (Codex P1 F7): deny.tf の refresh/update に必要
#    - 他は各 Phase の resource CRUD に必要な最小権限
BOOTSTRAP_RUNNER_ROLES="\
roles/cloudscheduler.admin \
roles/artifactregistry.admin \
roles/cloudbuild.workerPoolOwner \
roles/iam.serviceAccountAdmin \
roles/iam.workloadIdentityPoolAdmin \
roles/iam.denyAdmin \
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
echo "[bootstrap]  - Terraform state bucket, runner SA, WIF binding, and full runner"
echo "[bootstrap]    project-level IAM (conditional projectIamAdmin + Secret Manager"
echo "[bootstrap]    custom role + 10 predefined roles) are provisioned."
echo "[bootstrap]  - Deny Policy on the runner SA is applied by the next terraform apply"
echo "[bootstrap]    (via GitHub Actions on merge to main), which uses the bootstrap-granted"
echo "[bootstrap]    denyAdmin to refresh terraform/deny.tf."
echo "[bootstrap]  - Adding a new role for the runner: edit this script and re-run"
echo "[bootstrap]    (bootstrap is now the SSoT for runner IAM; do NOT re-declare"
echo "[bootstrap]    runner bindings in Terraform — that reintroduces the F8 chicken-egg)."
echo "[bootstrap]  - Add or modify secrets via a PR that edits terraform/secret_iam.tf."
