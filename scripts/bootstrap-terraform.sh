#!/usr/bin/env bash
# =============================================================================
# Terraform 運用の bootstrap セットアップ (idempotent、project owner が実行)
# =============================================================================
#
# 本スクリプトは Terraform runner SA を含む **project-level IAM 全域の唯一の
# SSoT**。Terraform 側は「他 SA が Cloud Run / AR repo 等の resource IAM に
# 付ける最小権限」だけを扱い、project-level bindings と SA metadata は一切
# 宣言しない (2026-07-14 refactor / F1 structural closure)。
#
# ## bootstrap-owns-all-project-IAM 契約
#
# 過去の設計は runner に `roles/resourcemanager.projectIamAdmin` (with CEL
# `hasOnly ['secretAccessor']`) と `roles/iam.serviceAccountAdmin` を渡し、
# Terraform 側で secretAccessor grant / cross-SA impersonation grant を宣言
# していた。しかしこの構成には 2 系統の privilege escalation 経路が残っていた
# (research: `f1-residual-attack-analysis`):
#
#   - **Chain 1 (projectIamAdmin)**: hasOnly CEL は「どの role を grant できるか」
#     を絞るが「grantee は誰か」は絞らない。attacker が新規 SA を作って
#     `secretAccessor` を付けて `versions.access` する経路は残る (deny policy は
#     runner-principal のみ block、他 SA には無効)。
#   - **Chain 2 (serviceAccountAdmin)**: runner が任意 SA に対して
#     `iam.serviceAccounts.setIamPolicy` を呼べる → 任意 SA を impersonate する
#     tokenCreator を自分に付与できる → runtime-sa を impersonate して secret 値を読める。
#
# **構造的閉じ方**: 両 role を runner から外し、必要な grant は全て bootstrap
# (project owner 権限) で out-of-band 付与する。runner は「自分自身の IAM を
# 触れない」「他 SA の IAM も触れない」構造になり、上記 2 chain が物理的に消える。
#
# 副次効果として、Deny Policy (Codex P1 F7 for defense-in-depth) は runner が
# secret 値へ辿り着く allow-policy 経路がゼロなので理論上不要になる。
# ただし追加防御として bootstrap で作成する (org-admin 権限がない環境では
# optional で skip 可能 — `SKIP_DENY_POLICY=1` で明示的に skip、または create が
# permission denied で失敗しても warning のみで続行)。
#
# 本スクリプトが構成する項目:
#
#   1. GCS bucket (Terraform state 保存先、versioning ON)
#   2. terraform-runner service account (idempotent)
#   3. runtime / build / scheduler SAs (idempotent、旧 service_accounts.tf の
#      resource 相当を bootstrap 化)
#   4. GCS bucket への runner SA の書込許可 (最小権限、bucket 単位)
#   5. Workload Identity Federation binding (既存 pool `github-actions` を再利用)
#   6. Secret Manager custom role `terraformRunnerSecretManagerNoPolicyMgmt` の
#      create/update (D1、setIamPolicy / getIamPolicy を除外して F1 self-grant 経路を封鎖)
#   7. custom role D1 の runner SA への grant
#   8. runtime-sa / build-sa への project-level 直接 grants:
#      - runtime-sa: secretmanager.secretAccessor (旧 secret_iam.tf)
#      - build-sa:   secretmanager.secretAccessor (旧 secret_iam.tf)
#      - build-sa:   cloudbuild.builds.builder    (旧 iam_project.tf)
#      - build-sa:   logging.logWriter            (旧 iam_project.tf)
#   9. SA-scoped impersonation grants:
#      - build-sa uses runtime-sa    (iam.serviceAccountUser, 旧 iam_cloud_run.tf)
#      - runner uses scheduler-sa    (iam.serviceAccountUser, 旧 service_accounts.tf)
#  10. IAM Deny Policy `block-terraform-runner-secret-value-read` の create
#      (optional defense-in-depth — org-admin 権限がない場合は warning で skip)
#  11. 残りの predefined roles (Phase 2-7 の resource CRUD 用の最小権限セット)
#      の grant (projectIamAdmin / serviceAccountAdmin は含まれない)
#
# ## 追加 role の運用手順
#
# 新規 role を runner または他 SA に付けたい場合は本スクリプトの該当 section
# に追記し、本スクリプトを再実行する (idempotent)。**Terraform 側 (project-level
# `google_project_iam_member`) には一切追加しない** (F1 structural closure を
# 破ることになる)。resource-scoped IAM (Cloud Run / AR / IAP など) は
# Terraform 側で最小権限管理を継続する (runner はそれらに対する権限を持つため)。
#
# ## 前提
#   - gcloud CLI 認証済み (`gcloud auth login`)、project owner 相当の権限が必要
#   - WIF pool `github-actions` は既に構築されている
#     (docs/gcp-production-setup.md 参照)
#   - Deny Policy step は org-admin (`roles/iam.denyAdmin` at org/folder) が
#     必要 — 権限がない場合は自動で skip して warning を出す (SKIP_DENY_POLICY=1
#     で明示 skip 可能)
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/bootstrap-terraform.sh
#
# ## 環境変数
#   PROJECT_ID          GCP プロジェクト ID (必須)
#   PROJECT_NUMBER      自動取得 (gcloud projects describe から)
#   REGION              default: asia-northeast1
#   STATE_BUCKET        default: ${PROJECT_ID}-terraform-state
#   TERRAFORM_SA        default: terraform-runner@${PROJECT_ID}.iam.gserviceaccount.com
#   RUNTIME_SA          default: myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com
#   BUILD_SA            default: myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com
#   SCHEDULER_SA        default: myrrh-rental-space-scheduler@${PROJECT_ID}.iam.gserviceaccount.com
#   WIF_POOL_ID         default: github-actions
#   GITHUB_REPO         default: y2ikgm89/myrrh-rental-space
#   SKIP_DENY_POLICY    "1" 指定時は Deny Policy step を明示的に skip
#   DRY_RUN             "1" 指定時は gcloud コマンドを出力するだけで実行しない
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
: "${PROJECT_NUMBER:=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')}"
REGION="${REGION:-asia-northeast1}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT_ID}-terraform-state}"
TERRAFORM_SA="${TERRAFORM_SA:-terraform-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
RUNTIME_SA="${RUNTIME_SA:-myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
BUILD_SA="${BUILD_SA:-myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com}"
SCHEDULER_SA="${SCHEDULER_SA:-myrrh-rental-space-scheduler@${PROJECT_ID}.iam.gserviceaccount.com}"
WIF_POOL_ID="${WIF_POOL_ID:-github-actions}"
GITHUB_REPO="${GITHUB_REPO:-y2ikgm89/myrrh-rental-space}"
SKIP_DENY_POLICY="${SKIP_DENY_POLICY:-0}"
DRY_RUN="${DRY_RUN:-0}"

echo "[bootstrap] Project:              ${PROJECT_ID} (number ${PROJECT_NUMBER})"
echo "[bootstrap] State bucket:         gs://${STATE_BUCKET}"
echo "[bootstrap] Terraform runner SA:  ${TERRAFORM_SA}"
echo "[bootstrap] Runtime SA:           ${RUNTIME_SA}"
echo "[bootstrap] Build SA:             ${BUILD_SA}"
echo "[bootstrap] Scheduler SA:         ${SCHEDULER_SA}"
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

# -----------------------------------------------------------------------------
# 1. GCS state bucket (idempotent)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# 2. Terraform runner SA (idempotent)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# 3. runtime / build / scheduler SAs (idempotent、bootstrap-owns-all 契約で
#    Terraform から移管)
# -----------------------------------------------------------------------------
#    過去は terraform/service_accounts.tf の `google_service_account` resource
#    が SSoT だったが、bootstrap-owns-all-project-IAM 不変式に従い bootstrap 化。
#    Terraform 側では既知 email を variable で参照するだけ (SA metadata は
#    bootstrap の SSoT)。
create_sa_if_missing() {
  local account_id="$1"    # e.g. "myrrh-rental-space-runtime"
  local email="$2"         # e.g. "myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
  local display_name="$3"
  local description="$4"

  if [ "${DRY_RUN}" != "1" ] \
     && gcloud iam service-accounts describe "${email}" \
          --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "[bootstrap] SA ${account_id} exists — skipping create"
  else
    echo "[bootstrap] Creating SA ${account_id}"
    run gcloud iam service-accounts create "${account_id}" \
      --project="${PROJECT_ID}" \
      --display-name="${display_name}" \
      --description="${description}"
  fi
}

create_sa_if_missing \
  "myrrh-rental-space-runtime" \
  "${RUNTIME_SA}" \
  "Cloud Run runtime + Prisma migrate Job" \
  "Runs Cloud Run public / admin services and the prisma-migrate Cloud Run Job. Reads runtime secrets via Secret Manager."

create_sa_if_missing \
  "myrrh-rental-space-build" \
  "${BUILD_SA}" \
  "Cloud Build deploy pipeline" \
  "Runs Cloud Build steps (image build/push, Cloud Run deploy). Impersonated by GitHub Actions deploy-production.yml via WIF."

create_sa_if_missing \
  "myrrh-rental-space-scheduler" \
  "${SCHEDULER_SA}" \
  "Cloud Scheduler OIDC caller" \
  "Issues OIDC tokens for Cloud Scheduler → Cloud Run cron invocations."

# -----------------------------------------------------------------------------
# 4. state bucket への Terraform runner の書込許可 (最小権限、bucket 単位)
# -----------------------------------------------------------------------------
echo "[bootstrap] Granting runner SA storage.objectAdmin on state bucket"
run gcloud storage buckets add-iam-policy-binding "gs://${STATE_BUCKET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/storage.objectAdmin"

# -----------------------------------------------------------------------------
# 5. Workload Identity Federation binding
#    既存 pool "github-actions" を再利用し、GitHub Actions が
#    terraform-runner SA を impersonate できるようにする。
# -----------------------------------------------------------------------------
echo "[bootstrap] Binding WIF principalSet to Terraform runner SA"
run gcloud iam service-accounts add-iam-policy-binding "${TERRAFORM_SA}" \
  --project="${PROJECT_ID}" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
  --role="roles/iam.workloadIdentityUser"

# -----------------------------------------------------------------------------
# 6. Secret Manager custom role (D1) - idempotent create/update
#    bootstrap-owns-all-project-IAM 契約下で runner が Terraform の
#    google_secret_manager_secret (container 生成) を管理するのに必要な
#    最小 permission セット。projectIamAdmin / serviceAccountAdmin が runner
#    から外れているため F1 chain 1/2 は構造的に閉じており、この custom role
#    自体は container CRUD + read-only version 参照だけを持つ (write 系
#    permissions は削除、下記の 2026-07-14 F2 hardening 参照)。
#
#    permissions list (8 個):
#      - secret metadata CRUD (5): secrets.create/delete/get/list/update
#      - version read-only (2): versions.get/list (Terraform state refresh 用)
#      - provider refresh (1): resourcemanager.projects.get
#
#    2026-07-14 F2 hardening: 下記 permissions は意図的に omit:
#      - secrets.setIamPolicy / getIamPolicy — F1 self-grant guard
#      - versions.access — 値読取封鎖 (Deny Policy が optional なので必ず外す)
#      - versions.add — attacker-controlled secret injection の禁止
#        (secret 値は project owner が gcloud secrets versions add で手動投入
#         する運用が SSoT — docs/runbooks/encryption-key-rotation.md 参照)
#      - versions.destroy — 永続 DoS (compact 済み version は復旧不能) の禁止
#      - versions.disable — 可逆 DoS の禁止
#      - versions.enable — compromised version の再有効化の禁止
#
#    これで runner は container の shape (labels, replication, etc.) だけを
#    管理し、値 (versions) には触れられない = Deny Policy の主機能を role
#    定義側で表現できているので Deny Policy が skip されても integrity は
#    保たれる (confidentiality は structural closure が担当)。
# -----------------------------------------------------------------------------
CUSTOM_ROLE_ID="terraformRunnerSecretManagerNoPolicyMgmt"
CUSTOM_ROLE_PERMISSIONS="secretmanager.secrets.create,secretmanager.secrets.delete,secretmanager.secrets.get,secretmanager.secrets.list,secretmanager.secrets.update,secretmanager.versions.get,secretmanager.versions.list,resourcemanager.projects.get"
CUSTOM_ROLE_TITLE="TF Runner Secret Manager (container CRUD only, no version writes, no IAM policy mgmt)"
CUSTOM_ROLE_DESCRIPTION="F1+F2 structural closure: runner can create/update/delete secret containers and read version metadata, but cannot read/inject/destroy version values or delegate IAM. Combined with removed projectIamAdmin/serviceAccountAdmin, this leaves no allow-policy path to secret values (see terraform/README.md 'Runner IAM ownership contract')."

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

# -----------------------------------------------------------------------------
# 7. Custom role → runner SA の grant
#    Secret Manager metadata / version 管理を runner に委ねる。
# -----------------------------------------------------------------------------
echo "[bootstrap] Granting runner SA custom role ${CUSTOM_ROLE_ID}"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}" \
  --condition=None

# -----------------------------------------------------------------------------
# 8. runtime-sa / build-sa への project-level 直接 grants
#    (旧 terraform/secret_iam.tf + terraform/iam_project.tf からの移管)
#
#    runner から `projectIamAdmin` を外した (F1 structural closure) ため、
#    これらの binding は Terraform では宣言できない。bootstrap で直接付与する。
# -----------------------------------------------------------------------------
echo "[bootstrap] Granting runtime-sa roles/secretmanager.secretAccessor (project-level)"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

echo "[bootstrap] Granting build-sa roles/secretmanager.secretAccessor (project-level)"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

echo "[bootstrap] Granting build-sa roles/cloudbuild.builds.builder"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/cloudbuild.builds.builder" \
  --condition=None

echo "[bootstrap] Granting build-sa roles/logging.logWriter"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/logging.logWriter" \
  --condition=None

# -----------------------------------------------------------------------------
# 9. SA-scoped impersonation grants
#    (旧 terraform/iam_cloud_run.tf の build_sa_uses_runtime_sa +
#     旧 terraform/service_accounts.tf の terraform_runner_uses_scheduler_sa)
#
#    runner から `iam.serviceAccountAdmin` を外した (F1 structural closure) ため、
#    runner は他 SA の IAM policy に書き込めない。よって cross-SA impersonation
#    binding も bootstrap で直接付与する。
# -----------------------------------------------------------------------------
echo "[bootstrap] Granting build-sa serviceAccountUser on runtime-sa (deploy 時 actAs)"
run gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

echo "[bootstrap] Granting runner SA serviceAccountUser on runtime-sa (Cloud Run v2 apply/update 時 actAs)"
# Terraform の google_cloud_run_v2_service / google_cloud_run_v2_job の
# template.service_account = runtime-sa 指定は Cloud Run v2 API が create/update
# 両方で iam.serviceAccounts.actAs を validate する。runner から
# serviceAccountAdmin を外した (F1 structural closure) ため、SA-scoped で明示
# 付与しないと apply/update が 403 で失敗する。
run gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/iam.serviceAccountUser"

echo "[bootstrap] Granting runner SA serviceAccountUser on scheduler-sa (Cloud Scheduler job 作成時 actAs)"
run gcloud iam service-accounts add-iam-policy-binding "${SCHEDULER_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${TERRAFORM_SA}" \
  --role="roles/iam.serviceAccountUser"

# -----------------------------------------------------------------------------
# 10. IAM Deny Policy (optional defense-in-depth、Codex P1 F7)
#
#     bootstrap-owns-all-project-IAM 契約により runner から secret 値へ辿り着く
#     allow-policy 経路は既にゼロ (runner has no projectIamAdmin nor
#     serviceAccountAdmin)。ゆえに Deny Policy は理論上冗長だが、追加防御として
#     bootstrap で作成する:
#       - 誰かが後から手動 (Console) で runner に強力 role を付けた場合の
#         belt-and-suspenders
#       - Cloud Asset Inventory drift alert が発火する前に読取を封じる
#
#     Deny Policy 作成には `roles/iam.denyAdmin` (Organization / Folder scope
#     専用、Google IAM 制約で project scope 不可) が必要。org-admin 権限がない
#     環境では以下いずれかで skip:
#       - `SKIP_DENY_POLICY=1` を明示指定
#       - 権限不足で create が失敗した場合、warning のみで続行 (script は落ちない)
#
#     参考: https://cloud.google.com/iam/docs/deny-access-cli
# -----------------------------------------------------------------------------
DENY_POLICY_ID="block-terraform-runner-secret-value-read"
DENY_POLICY_ATTACHMENT_POINT="cloudresourcemanager.googleapis.com/projects/${PROJECT_ID}"

if [ "${SKIP_DENY_POLICY}" = "1" ]; then
  echo "[bootstrap] SKIP_DENY_POLICY=1 → Deny Policy step を skip"
  echo "[bootstrap]   (structural closure = runner has no projectIamAdmin / serviceAccountAdmin が primary control)"
else
  DENY_POLICY_FILE=$(mktemp -t bootstrap-deny-policy-XXXXXX.json)
  trap 'rm -f "${DENY_POLICY_FILE}"' EXIT
  cat > "${DENY_POLICY_FILE}" <<DENY_POLICY_JSON
{
  "displayName": "Block Terraform runner SA from reading Secret Manager values",
  "rules": [
    {
      "description": "Defense-in-depth: block runner from reading/mutating secret values even if another role is added by mistake (Codex P1 #1053, F2, F7). Primary control is the structural closure (no projectIamAdmin, no serviceAccountAdmin).",
      "denyRule": {
        "deniedPrincipals": [
          "principal://iam.googleapis.com/projects/-/serviceAccounts/${TERRAFORM_SA}"
        ],
        "deniedPermissions": [
          "secretmanager.googleapis.com/versions.access",
          "secretmanager.googleapis.com/versions.add",
          "secretmanager.googleapis.com/versions.destroy",
          "secretmanager.googleapis.com/versions.disable",
          "secretmanager.googleapis.com/versions.enable"
        ]
      }
    }
  ]
}
DENY_POLICY_JSON

  if [ "${DRY_RUN}" = "1" ]; then
    echo "[bootstrap][DRY_RUN] deny policy JSON (written to ${DENY_POLICY_FILE}):"
    sed 's/^/[bootstrap][DRY_RUN]   /' "${DENY_POLICY_FILE}"
  fi

  # 存在チェックは `gcloud iam policies get` を使う (`describe` subcommand は
  # `gcloud iam policies` 配下に存在せず常に silent fail → 2 回目以降 create が
  # "already exists" で毎回落ちる Codex P2 #1071)。
  if [ "${DRY_RUN}" != "1" ] \
     && gcloud iam policies get "${DENY_POLICY_ID}" \
          --attachment-point="${DENY_POLICY_ATTACHMENT_POINT}" \
          --kind=denypolicies >/dev/null 2>&1; then
    echo "[bootstrap] Deny policy ${DENY_POLICY_ID} already exists — skipping"
    echo "[bootstrap]   To modify: project owner が \`gcloud iam policies update\` を手動実行"
  else
    echo "[bootstrap] Creating deny policy ${DENY_POLICY_ID}"
    # 権限不足で失敗しても script は続行 (Deny Policy は optional defense-in-depth)。
    if run gcloud iam policies create "${DENY_POLICY_ID}" \
        --attachment-point="${DENY_POLICY_ATTACHMENT_POINT}" \
        --kind=denypolicies \
        --policy-file="${DENY_POLICY_FILE}"; then
      echo "[bootstrap] Deny policy ${DENY_POLICY_ID} created"
    else
      echo "[bootstrap] WARNING: Deny policy creation failed (permission denied?)"
      echo "[bootstrap]   Optional defense-in-depth is NOT enabled. Primary control (structural"
      echo "[bootstrap]   closure = no projectIamAdmin / no serviceAccountAdmin on runner) is intact."
      echo "[bootstrap]   To skip this step explicitly and suppress the warning, set SKIP_DENY_POLICY=1."
      echo "[bootstrap]   To enable the deny policy, retry from an account with roles/iam.denyAdmin"
      echo "[bootstrap]   at the org or folder scope (project scope grant is blocked by Google IAM constraint)."
    fi
  fi
fi

# -----------------------------------------------------------------------------
# 11. 残りの predefined roles (Phase 2-7 に必要な最小権限セット)
#     (F1 structural closure により projectIamAdmin と serviceAccountAdmin は
#      含まれない — runner は「自 IAM も他 SA IAM も触れない」)
# -----------------------------------------------------------------------------
BOOTSTRAP_RUNNER_ROLES="\
roles/cloudscheduler.admin \
roles/artifactregistry.admin \
roles/cloudbuild.workerPoolOwner \
roles/iam.workloadIdentityPoolAdmin \
roles/run.admin \
roles/compute.networkAdmin \
roles/compute.securityAdmin \
roles/iap.admin \
roles/serviceusage.serviceUsageAdmin \
"
for role in ${BOOTSTRAP_RUNNER_ROLES}; do
  echo "[bootstrap] Granting runner SA ${role}"
  run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${TERRAFORM_SA}" \
    --role="${role}" \
    --condition=None
done

echo "[bootstrap] done."
echo "[bootstrap]  - Terraform state bucket, all 4 SAs (runner + runtime + build +"
echo "[bootstrap]    scheduler), WIF binding, all project-level IAM (custom role D1 +"
echo "[bootstrap]    project bindings for runtime/build SAs + SA-scoped impersonation)"
echo "[bootstrap]    are provisioned by this script (bootstrap-owns-all-project-IAM 契約)。"
echo "[bootstrap]  - Runner has NO projectIamAdmin nor serviceAccountAdmin (F1 structural"
echo "[bootstrap]    closure): runner cannot self-grant privileges nor mutate other SAs' IAM."
if [ "${SKIP_DENY_POLICY}" != "1" ]; then
  echo "[bootstrap]  - Deny Policy (optional defense-in-depth) blocks Secret Manager"
  echo "[bootstrap]    versions.access/add/destroy/disable/enable on runner SA (if created)."
  echo "[bootstrap]    Warning line above indicates create was skipped due to permission."
fi
echo "[bootstrap]  - Adding a new role for ANY SA (runner / runtime / build / scheduler):"
echo "[bootstrap]    edit this script and re-run (idempotent). Terraform 側の project-level"
echo "[bootstrap]    IAM 追記は禁止 — F1 structural closure を破ることになる。"
echo "[bootstrap]  - Modifying the Deny Policy: project owner が gcloud iam policies"
echo "[bootstrap]    update を手動実行 (bootstrap は create のみで既存を上書きしない)。"
echo "[bootstrap]  - Add or modify secrets via a PR that edits terraform/secrets.tf."
