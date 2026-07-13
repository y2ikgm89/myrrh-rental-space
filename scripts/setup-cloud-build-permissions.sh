#!/usr/bin/env bash
# =============================================================================
# Cloud Build SA に必要な IAM を付与するセットアップスクリプト（idempotent）
# =============================================================================
#
# 本スクリプトは Cloud Build service account に、cloudbuild.yaml の
# `grant-secret-access` step が実行する `gcloud secrets add-iam-policy-binding`
# を呼び出すために必要な最小権限を付与する。
#
# ## 付与する権限: プロジェクトレベルの custom role (最小権限)
#
# `roles/secretmanager.admin` は project-wide で secret の value read /
# version destroy / secret delete まで許可され、Cloud Build SA が compromise
# された場合に全 runtime secret (DATABASE_URL / ENCRYPTION_KEY / Cloudflare
# token 等) の漏洩・破壊経路を作ってしまう (Codex Cloud Review P1: PR#1052)。
#
# 代わりに次の 2 permission だけを持つ custom role を project にリソース化し、
# Cloud Build SA に付与する:
#
#   - secretmanager.secrets.getIamPolicy
#   - secretmanager.secrets.setIamPolicy
#
# これにより cloudbuild.yaml の `grant-secret-access` step は runtime SA へ
# `roles/secretmanager.secretAccessor` を付与できるが、secret の値そのものは
# 読めない・書けない・削除できない。
#
# ## なぜこのスクリプトが必要か
#
# Cloud Run の `--set-secrets=` は runtime SA が Secret Manager から secret
# を読む形で解決される。新規 secret を追加した際に手動で Secret Accessor role
# を付ける運用は setup 漏れによる silent deploy 失敗の温床だった (PR#1051)。
# cloudbuild.yaml の `grant-secret-access` step で自動反映することで恒久解決
# するが、Cloud Build SA 自身が IAM policy を変更できないと `add-iam-policy-
# binding` を実行できない。本スクリプトはその 1 度きりの bootstrap を提供する。
#
# ## 使い方
#   1. gcloud CLI 認証済み (`gcloud auth login`)、project owner 相当の権限が必要
#      (custom role の作成 + IAM binding 追加のため)
#   2. PROJECT_ID を設定
#   3. bash scripts/setup-cloud-build-permissions.sh
#
# ## 環境変数
#   PROJECT_ID   GCP プロジェクト ID (必須)
#   BUILD_SA     Cloud Build SA email (省略時は
#                myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com)
#   DRY_RUN      "1" 指定時は gcloud コマンドを出力するだけで実行しない
#
# ## 参考
#   - Secret Manager IAM roles (all-or-nothing の documented ロール一覧):
#     https://cloud.google.com/secret-manager/docs/access-control
#   - IAM custom roles (最小権限を組む公式ガイド):
#     https://cloud.google.com/iam/docs/creating-custom-roles
#   - Cloud Build user-specified service accounts:
#     https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
BUILD_SA="${BUILD_SA:-myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com}"
DRY_RUN="${DRY_RUN:-0}"

CUSTOM_ROLE_ID="secretIamManager"
CUSTOM_ROLE_FULL="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
CUSTOM_ROLE_TITLE="Secret Manager IAM Manager"
CUSTOM_ROLE_DESC="Manage IAM policies on Secret Manager secrets (no value access). Used by Cloud Build to grant Secret Accessor to runtime SA during deploy."
CUSTOM_ROLE_PERMS="secretmanager.secrets.getIamPolicy,secretmanager.secrets.setIamPolicy"

echo "[setup] Cloud Build SA:  ${BUILD_SA}"
echo "[setup] Project:         ${PROJECT_ID}"
echo "[setup] Custom role:     ${CUSTOM_ROLE_FULL}"
echo "[setup] Permissions:     ${CUSTOM_ROLE_PERMS}"

run() {
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[setup][DRY_RUN] '
    printf '%s ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# 1. custom role を idempotent に作成 / 更新
if [ "${DRY_RUN}" != "1" ] \
   && gcloud iam roles describe "${CUSTOM_ROLE_ID}" \
        --project="${PROJECT_ID}" --format='value(name)' >/dev/null 2>&1; then
  echo "[setup] Custom role exists — updating permissions to canonical set"
  run gcloud iam roles update "${CUSTOM_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${CUSTOM_ROLE_TITLE}" \
    --description="${CUSTOM_ROLE_DESC}" \
    --permissions="${CUSTOM_ROLE_PERMS}" \
    --stage=GA \
    --quiet
else
  echo "[setup] Creating custom role"
  run gcloud iam roles create "${CUSTOM_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="${CUSTOM_ROLE_TITLE}" \
    --description="${CUSTOM_ROLE_DESC}" \
    --permissions="${CUSTOM_ROLE_PERMS}" \
    --stage=GA \
    --quiet
fi

# 2. custom role を Cloud Build SA に付与 (idempotent)
echo "[setup] Binding custom role to Cloud Build SA"
run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="${CUSTOM_ROLE_FULL}" \
  --condition=None \
  --quiet

# 3. 過渡期に付与した roles/secretmanager.admin を剥奪 (idempotent)
#    PR#1052 の 前バージョンで案内した admin 付与を撤回する。
#    binding が存在しない場合は remove が warning を出して 0 で終わる (--quiet)。
echo "[setup] Removing legacy roles/secretmanager.admin binding if present"
run gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/secretmanager.admin" \
  --condition=None \
  --quiet 2>/dev/null || echo "[setup] (no legacy admin binding — nothing to remove)"

echo "[setup] done."
echo "[setup]  - Cloud Build SA can now manage Secret Manager IAM policies."
echo "[setup]  - Cloud Build SA CANNOT read or destroy secret values."
echo "[setup]  - Next deploy will apply roles/secretmanager.secretAccessor to"
echo "[setup]    the runtime SA for every secret referenced by cloudbuild.yaml."
