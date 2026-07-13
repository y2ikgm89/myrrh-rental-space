#!/usr/bin/env bash
# =============================================================================
# Secret Manager bootstrap セットアップスクリプト（idempotent）
# =============================================================================
#
# 本スクリプトは、cloudbuild.yaml の Cloud Run `--set-secrets=` binding で
# runtime service account が読む必要のある全 secret に対して、runtime SA へ
# `roles/secretmanager.secretAccessor` を idempotent に付与する。
# 過渡期に Cloud Build SA に付与した Secret Manager 系権限も剥奪する。
#
# ## なぜ Cloud Build から Secret Manager IAM 管理を分離したか
#
# 過去のバージョン (PR#1051 / #1052 / #1053 initial) では Cloud Build SA に
# Secret Manager IAM 変更権限 (`admin` あるいは自作 custom role
# `secretIamManager`) を持たせ、deploy pipeline の grant-secret-access step で
# 自動反映していた。しかし Cloud Build SA が持つ `secretmanager.secrets.setIamPolicy`
# は "self-grant" 経路になり、compromise された SA は自分自身に
# `roles/secretmanager.secretAccessor` を任意 secret に付与して全 runtime
# secret を読める (Codex Cloud Review P1: PR #1053 comment 3572078673)。
#
# 結論: **Cloud Build SA は Secret Manager 系権限をゼロにする**。
# IAM 管理は project owner が本スクリプト経由で bootstrap / 新規 secret
# 追加時に手動実行する。cloudbuild.yaml の `grant-secret-access` step は削除。
#
# ## 新規 secret 追加時のフロー
#
#   1. cloudbuild.yaml の `--set-secrets=` に SECRET を追加
#   2. 本スクリプトの SECRETS 配列に SECRET を追加
#   3. bash scripts/setup-cloud-build-permissions.sh を実行 (project owner)
#   4. main へ merge → deploy
#
# `architecture-boundaries.test.ts` の drift gate が step 1 と step 2 の同期を
# CI で強制する。実行忘れは deploy 前に unit test で検出。
#
# ## 使い方
#   1. gcloud CLI 認証済み (`gcloud auth login`)、project owner 相当の権限が必要
#      (Secret Manager IAM 変更 + project-level IAM 変更のため)
#   2. PROJECT_ID を設定
#   3. bash scripts/setup-cloud-build-permissions.sh
#
# ## 環境変数
#   PROJECT_ID   GCP プロジェクト ID (必須)
#   RUNTIME_SA   Cloud Run runtime SA email (省略時は
#                myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com)
#   BUILD_SA     Cloud Build SA email (省略時は
#                myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com)
#   DRY_RUN      "1" 指定時は gcloud コマンドを出力するだけで実行しない
#
# ## 参考
#   - Secret Manager IAM roles:
#     https://cloud.google.com/secret-manager/docs/access-control
#   - Cloud Build user-specified service accounts:
#     https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required (e.g. export PROJECT_ID=myrrh-rental-space)}"
RUNTIME_SA="${RUNTIME_SA:-myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
BUILD_SA="${BUILD_SA:-myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com}"
DRY_RUN="${DRY_RUN:-0}"

# Cloud Run `--set-secrets=` で runtime SA が読む必要のある全 secret。
# cloudbuild.yaml の `--set-secrets=` と drift gate で同期を強制する。
# 新規 secret を cloudbuild.yaml に追加したら本 list にも追記して本スクリプトを再実行する。
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

echo "[setup] Project:      ${PROJECT_ID}"
echo "[setup] Runtime SA:   ${RUNTIME_SA}"
echo "[setup] Build SA:     ${BUILD_SA}"
echo "[setup] Secrets:      ${#SECRETS[@]}"

run() {
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[setup][DRY_RUN] '
    printf '%s ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# 1. 各 secret に runtime SA の secretAccessor を idempotent に付与
for secret in "${SECRETS[@]}"; do
  echo "[setup] Granting secretAccessor on ${secret} to runtime SA"
  run gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None \
    --quiet
done

# 2. 過渡期に Cloud Build SA に付与した Secret Manager 系権限を revoke。
#
#    `--all` を使うことで condition 付き / condition 無し 両方の binding を
#    削除する (Codex Cloud Review P1: PR #1055 comment 3572307237)。
#    `--condition=None` だと unconditional binding のみが対象で、attacker
#    (or 過去の運用) が IAM Condition 付きで secretmanager.admin を残していた
#    場合に silent に見逃す。self-grant 経路を残さないため全 conditions を revoke。
#
#    "binding が存在しない" 系エラーのみ許容し、他 error (permission 不足 /
#    API error 等) では即 fail する。silent success で admin/self-grant 経路が
#    残るのを防ぐ (Codex Cloud Review P2: PR #1053 comment 3572078678)。
revoke_binding_strict() {
  local role="$1"
  echo "[setup] Removing all ${role} bindings from Cloud Build SA"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[setup][DRY_RUN] gcloud projects remove-iam-policy-binding %s --member=serviceAccount:%s --role=%s --all --quiet\n' \
      "${PROJECT_ID}" "${BUILD_SA}" "${role}"
    return 0
  fi
  local err_file
  err_file=$(mktemp)
  local rc=0
  gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${BUILD_SA}" \
    --role="${role}" \
    --all \
    --quiet 2>"${err_file}" || rc=$?
  if [ "${rc}" -eq 0 ]; then
    rm -f "${err_file}"
    return 0
  fi
  # gcloud が "binding が無い" ケースで出す文言は API バージョンで揺れる。
  # `--all` 使用時の実測メッセージ例:
  #   - "Policy binding with the specified principal and role not found!"
  #   - "Policy binding with the specified member and role not found!" (古い版)
  #   - "does not have any bindings" (project に IAM policy 自体が空のケース)
  # "Policy binding" と "not found" が同一行に現れれば binding 不在と判定する。
  # マッチしなければ即 fail (permission 不足 / API error 等は silent success
  # させない — Codex Cloud Review P2 #1053 の要求)。
  if grep -qEi '(Policy binding.*not found|does not have any (bindings|matching binding))' "${err_file}"; then
    echo "[setup]   (no ${role} binding — nothing to remove)"
    rm -f "${err_file}"
    return 0
  fi
  echo "[setup] ERROR: failed to remove ${role} binding from ${BUILD_SA}" >&2
  echo "[setup]        stderr follows — legacy admin/self-grant path may still exist" >&2
  cat "${err_file}" >&2
  rm -f "${err_file}"
  return 1
}

revoke_binding_strict "roles/secretmanager.admin"
revoke_binding_strict "projects/${PROJECT_ID}/roles/secretIamManager"

echo "[setup] done."
echo "[setup]  - runtime SA can read all ${#SECRETS[@]} Cloud Run secrets."
echo "[setup]  - Cloud Build SA has NO Secret Manager IAM management permission."
echo "[setup]  - To add a new secret: update cloudbuild.yaml --set-secrets= AND"
echo "[setup]    the SECRETS array in this script, then re-run."
