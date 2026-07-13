#!/usr/bin/env bash
# =============================================================================
# Cloud Build SA に必要な IAM を付与するセットアップスクリプト（idempotent）
# =============================================================================
#
# 本スクリプトは Cloud Build service account に、cloudbuild.yaml の
# `grant-secret-access` step が実行する `gcloud secrets add-iam-policy-binding`
# を呼び出すために必要な最小権限を付与する。
#
# 付与する role: roles/secretmanager.secretIamAdmin (project レベル)
#   - Secret Manager の IAM policy 変更のみ許可
#   - Secret 値の読み書きは付与しない (最小権限原則)
#
# なぜこのスクリプトが必要か:
#   Cloud Run の `--set-secrets=` は runtime SA が Secret Manager から secret
#   を読む形で解決される。新規 secret を追加した際に手動で Secret Accessor role
#   を付ける運用は setup 漏れによる silent deploy 失敗の温床だった。
#   cloudbuild.yaml の `grant-secret-access` step で自動反映することで恒久解決
#   するが、Cloud Build SA 自身が `secretIamAdmin` を持たないと IAM 変更を
#   実行できない。本スクリプトはその 1 度きりの bootstrap を提供する。
#
# 使い方:
#   1. gcloud CLI 認証済み (`gcloud auth login`)、project owner 相当の権限が必要
#   2. PROJECT_ID を設定
#   3. bash scripts/setup-cloud-build-permissions.sh
#
# 環境変数:
#   PROJECT_ID   GCP プロジェクト ID (必須)
#   BUILD_SA     Cloud Build SA email (省略時は
#                myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com)
#   DRY_RUN      "1" 指定時は gcloud コマンドを出力するだけで実行しない
#
# 参考:
#   - Secret Manager IAM roles:
#     https://cloud.google.com/secret-manager/docs/access-control
#   - Cloud Build user-specified service accounts:
#     https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts
#   - Least-privilege role recommendations:
#     https://cloud.google.com/iam/docs/using-iam-securely#least_privilege
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
BUILD_SA="${BUILD_SA:-myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com}"
DRY_RUN="${DRY_RUN:-0}"

echo "[setup] Cloud Build SA: ${BUILD_SA}"
echo "[setup] Project:        ${PROJECT_ID}"
echo "[setup] Granting role:  roles/secretmanager.secretIamAdmin"

CMD=(
  gcloud projects add-iam-policy-binding "${PROJECT_ID}"
  --member="serviceAccount:${BUILD_SA}"
  --role="roles/secretmanager.secretIamAdmin"
  --condition=None
  --quiet
)

if [ "${DRY_RUN}" = "1" ]; then
  printf '[setup][DRY_RUN] '
  printf '%s ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

"${CMD[@]}"

echo "[setup] done: Cloud Build SA can now manage Secret Manager IAM policies."
echo "[setup]       Next deploy will apply roles/secretmanager.secretAccessor to"
echo "[setup]       the runtime SA for every secret referenced by cloudbuild.yaml."
