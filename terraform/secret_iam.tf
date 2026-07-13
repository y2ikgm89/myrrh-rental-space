# -----------------------------------------------------------------------------
# Secret Manager IAM (Phase 1)
# -----------------------------------------------------------------------------
#
# Cloud Run `--set-secrets=` の runtime SA 読取許可、および Cloud Build
# `availableSecrets` 経由の build SA 読取許可を Terraform で宣言的に管理する。
#
# SSoT 契約:
#   - runtime_secrets の内容は cloudbuild.yaml の `--set-secrets=` に登場する
#     全 secret 名と一致させる (drift は architecture-boundaries.test.ts の
#     Terraform gate が CI で強制)。
#   - build_secrets の内容は cloudbuild.yaml の availableSecrets ブロックに
#     登場する全 secret 名と一致させる。
#
# 手動 gcloud add-iam-policy-binding は禁止 — terraform apply が唯一の更新
# 経路 (drift は terraform plan で検出、PR review で審査)。

locals {
  # Cloud Run `--set-secrets=` で runtime SA が読む必要のある全 secret。
  # 新規追加時は cloudbuild.yaml とここの両方を更新すること (drift gate が
  # forgetting を CI で block する)。
  runtime_secrets = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "ENCRYPTION_KEY",
    "SECONDARY_ENCRYPTION_KEYS",
    "AUDIT_LOG_HMAC_KEY",
    "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
    "CLOUDFLARE_ZONE_ID",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ORIGIN_HEADER_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]

  # Cloud Build が image build 時に availableSecrets 経由で読む secret。
  # runtime SA だけでなく build SA にも secretAccessor が必要。
  build_secrets = [
    "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  ]
}

# runtime SA 全 secret 用の secretAccessor (non-authoritative =
# 他 principal の binding を破壊しない)
resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each = toset(local.runtime_secrets)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.runtime_sa_email}"
}

# build SA build-time secret 用の secretAccessor
resource "google_secret_manager_secret_iam_member" "build_accessor" {
  for_each = toset(local.build_secrets)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.build_sa_email}"
}
