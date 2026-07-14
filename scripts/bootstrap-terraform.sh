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
#   7. custom role D1 の runner SA への grant (A3)
#   7b. Deny Policy custom role `terraformRunnerDenyPolicyManager` の
#      create/update + runner への grant (D2、delete/setIamPolicy を除外して
#      compromised runner が deny.tf を破棄・bypass する経路を封鎖)
#   8. 残りの predefined roles (A2 / A4-A12) の grant
#
# IAM Deny Policy (Codex P1 対策) は `terraform/deny.tf` に定義され、apply で
# 反映される (deny policy 管理権限は step 7b の custom role で bootstrap 済み)。
# roles/iam.denyAdmin (predefined) は Organization/Folder scope 専用で project
# には grant できないため、Codex F7 対応として project 用の custom role を
# 別途用意する。
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
#
#    CEL 式内部にカンマ (`api.getAttribute('...', [])` の第 2 引数区切り) が
#    含まれるため --condition の inline 指定は gcloud parser で誤分割されて
#    `argument --condition: valid keys are [None, description, expression, title]`
#    エラーになる。公式推奨の --condition-from-file で JSON 経由で渡す。
CONDITION_FILE=$(mktemp -t bootstrap-projectIamAdmin-cond-XXXXXX.json)
trap 'rm -f "${CONDITION_FILE}"' EXIT
cat > "${CONDITION_FILE}" <<'CONDITION_JSON'
{
  "expression": "api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly(['roles/secretmanager.secretAccessor'])",
  "title": "only_grant_secretmanager_secretAccessor",
  "description": "Restrict grantable roles to Secret Manager secretAccessor only (privilege escalation guard, Codex P1 #1053)"
}
CONDITION_JSON

if [ "${DRY_RUN}" = "1" ]; then
  echo "[bootstrap][DRY_RUN] projectIamAdmin condition JSON (written to ${CONDITION_FILE}):"
  sed 's/^/[bootstrap][DRY_RUN]   /' "${CONDITION_FILE}"
fi

echo "[bootstrap] Granting runner SA conditional projectIamAdmin (secretAccessor grant 用)"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/resourcemanager.projectIamAdmin" \
  --condition-from-file="${CONDITION_FILE}"

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

# 7b. Deny Policy 管理用 custom role (D2) - idempotent create/update
#     Codex P1 F7 対応。Terraform runner に deny.tf (`google_iam_deny_policy`) を
#     project scope で管理させる必要があるが、predefined role `roles/iam.denyAdmin`
#     は Organization / Folder scope 専用で project では grant 不可
#     (https://cloud.google.com/iam/docs/roles-permissions/iam#iam.denyAdmin)。
#
#     公式推奨 (https://cloud.google.com/iam/docs/deny-access) に従い project scope で
#     deny policy を管理する custom role を作成し runner に付ける。
#
#     permissions (4 個):
#       - iam.denypolicies.create / get / list / update
#     含まれない:
#       - iam.denypolicies.delete: runner compromise 時に deny policy を消して guard を
#         bypass する経路を封じる。deny.tf 側は `lifecycle { prevent_destroy = true }`
#         で terraform apply からの delete も遮断 (break-glass = project owner が gcloud
#         で削除)。
#       - iam.denypolicies.setIamPolicy / getIamPolicy: deny policy 自身の meta IAM は
#         触らせない (compromised runner が別 principal に管理権限を移譲する経路を封鎖)。
DENY_POLICY_ROLE_ID="terraformRunnerDenyPolicyManager"
DENY_POLICY_ROLE_PERMISSIONS="iam.denypolicies.create,iam.denypolicies.get,iam.denypolicies.list,iam.denypolicies.update"
DENY_POLICY_ROLE_TITLE="TF Runner Deny Policy Manager (no delete, no IAM policy mgmt)"
DENY_POLICY_ROLE_DESCRIPTION="Closes Codex P1 F7 at project scope: roles/iam.denyAdmin is Organization/Folder-only. Enables terraform apply of deny.tf without allowing compromised runner to delete the deny policy or delegate its IAM."

if [ "${DRY_RUN}" != "1" ] \
   && gcloud iam roles describe "${DENY_POLICY_ROLE_ID}" \
        --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap] Custom role ${DENY_POLICY_ROLE_ID} exists — updating (permissions drift check)"
  run gcloud iam roles update "${DENY_POLICY_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${DENY_POLICY_ROLE_TITLE}" \
    --description="${DENY_POLICY_ROLE_DESCRIPTION}" \
    --permissions="${DENY_POLICY_ROLE_PERMISSIONS}" \
    --stage=GA
else
  echo "[bootstrap] Creating custom role ${DENY_POLICY_ROLE_ID}"
  run gcloud iam roles create "${DENY_POLICY_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${DENY_POLICY_ROLE_TITLE}" \
    --description="${DENY_POLICY_ROLE_DESCRIPTION}" \
    --permissions="${DENY_POLICY_ROLE_PERMISSIONS}" \
    --stage=GA
fi

echo "[bootstrap] Granting runner SA custom role ${DENY_POLICY_ROLE_ID}"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="projects/${PROJECT_ID}/roles/${DENY_POLICY_ROLE_ID}" \
  --condition=None

# 8. 残りの predefined roles (A2 / A4-A12) の grant
#    各 Phase の resource CRUD に必要な最小権限。
#    (roles/iam.denyAdmin は 7b の custom role に置換済)
BOOTSTRAP_RUNNER_ROLES="\
roles/cloudscheduler.admin \
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
echo "[bootstrap]  - Terraform state bucket, runner SA, WIF binding, and full runner"
echo "[bootstrap]    project-level IAM (conditional projectIamAdmin + Secret Manager"
echo "[bootstrap]    custom role + Deny Policy manager custom role + 9 predefined"
echo "[bootstrap]    roles) are provisioned."
echo "[bootstrap]  - Deny Policy on the runner SA is applied by the next terraform apply"
echo "[bootstrap]    (via GitHub Actions on merge to main), using the bootstrap-granted"
echo "[bootstrap]    project-scope custom role terraformRunnerDenyPolicyManager to"
echo "[bootstrap]    refresh terraform/deny.tf (delete/setIamPolicy 除外で guard bypass 封鎖)."
echo "[bootstrap]  - Adding a new role for the runner: edit this script and re-run"
echo "[bootstrap]    (bootstrap is now the SSoT for runner IAM; do NOT re-declare"
echo "[bootstrap]    runner bindings in Terraform — that reintroduces the F8 chicken-egg)."
echo "[bootstrap]  - Add or modify secrets via a PR that edits terraform/secret_iam.tf."
