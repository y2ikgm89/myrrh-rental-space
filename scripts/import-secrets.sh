#!/usr/bin/env bash
# =============================================================================
# Secret Manager secrets 本体 → Terraform state import (Phase 3 bootstrap)
# =============================================================================
#
# `google_secret_manager_secret` として Terraform 管理下に既存 secret を取り込む。
# 値 (versions) は Terraform 対象外なので、値の import は行わない (metadata の
# みを state に載せる)。terraform apply 前に project owner が 1 度だけ実行。
#
# ## 前提
#   - Terraform 1.10+
#   - `bash scripts/bootstrap-terraform.sh` 実行済
#   - Phase 1 が既に apply 済 (state 内に secret_iam.tf の bindings が存在) or
#     Phase 3 と Phase 1 の同時 apply
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-secrets.sh
#
# ## 環境変数
#   PROJECT_ID   GCP プロジェクト ID (必須)
#   TF_DIR       default: terraform
#   DRY_RUN      "1" 指定時は terraform import コマンドを出力するだけで実行しない
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

# terraform/secret_iam.tf の runtime_secrets + build_secrets と一致させる。
# drift gate はここ経由の import 時に手戻りを防ぐため、SECRETS list を
# terraform config から自動生成することを推奨 (Phase 4 以降で自動化予定)。
SECRETS=(
  DATABASE_URL
  BETTER_AUTH_SECRET
  ENCRYPTION_KEY
  SECONDARY_ENCRYPTION_KEYS
  AUDIT_LOG_HMAC_KEY
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME
  R2_PUBLIC_URL
  CLOUDFLARE_ZONE_ID
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ORIGIN_HEADER_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
)

echo "[import-secrets] Project: ${PROJECT_ID}"
echo "[import-secrets] Secrets: ${#SECRETS[@]}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  echo "[import-secrets] terraform init"
  terraform init -input=false >/dev/null
fi

for secret in "${SECRETS[@]}"; do
  resource_addr="google_secret_manager_secret.secret[\"${secret}\"]"
  resource_id="projects/${PROJECT_ID}/secrets/${secret}"
  echo "[import-secrets] ${resource_addr} ← ${resource_id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import-secrets][DRY_RUN] terraform import %q %q\n' "${resource_addr}" "${resource_id}"
    continue
  fi
  if terraform state show "${resource_addr}" >/dev/null 2>&1; then
    echo "[import-secrets]   already in state — skipping"
    continue
  fi
  terraform import -input=false "${resource_addr}" "${resource_id}"
done

popd >/dev/null

echo "[import-secrets] done."
echo "[import-secrets]  - Run 'cd ${TF_DIR} && terraform plan' and verify 'No changes'."
echo "[import-secrets]  - Then merge the Phase 3 PR to hand ownership over to Terraform."
