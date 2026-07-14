# -----------------------------------------------------------------------------
# Secret Manager secrets 本体 (Phase 3)
# -----------------------------------------------------------------------------
#
# runtime_secrets と build_secrets の全 secret_id を宣言的に管理する。
# secret **値** (versions) は project owner が manual (gcloud secrets versions add
# / encryption-key-rotation.md の手順) で管理し、Terraform 対象外。
#
# `prevent_destroy` で destroy を無条件 block: Terraform code から entry を削除
# しても `terraform apply` は fail する。secret を実際に廃止する場合は
# lifecycle を一時的に緩めるか、gcloud で先に手動削除してから Terraform state
# を rm する 2 段階手順を踏む (誤 destroy 防止)。

locals {
  # Cloud Run `--set-secrets=` で runtime SA が読む必要のある全 secret。
  # cloudbuild.yaml の `--set-secrets=` に登場する全 secret 名と一致させる。
  # 新規追加はここに 1 行追加 → terraform apply で container 生成 → project
  # owner が gcloud secrets versions add で値を投入、の順。
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
  # runtime SA だけでなく build SA にも secretAccessor が必要 (project-level
  # binding は `scripts/bootstrap-terraform.sh` の section 8 で付与、
  # per-secret 個別付与は F1 対策で廃止 — 2026-07-14 F1 refactor で Terraform
  # 側の secret_iam.tf も削除して bootstrap の SSoT に完全集約)。
  build_secrets = [
    "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  ]

  # runtime_secrets と build_secrets の union (重複除去)。
  all_secrets = toset(concat(local.runtime_secrets, local.build_secrets))
}

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  for_each = local.all_secrets
  to       = google_secret_manager_secret.secret[each.value]
  id       = "projects/${var.project_id}/secrets/${each.value}"
}

resource "google_secret_manager_secret" "secret" {
  for_each = local.all_secrets

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true

    # labels / annotations は Cloud Console から手動編集する余地を残す。
    # secret 値 (versions) は Terraform 対象外 (Google provider は versions を
    # google_secret_manager_secret_version リソースで別途扱うが、本設計では
    # 値は Terraform に取り込まない)。
    ignore_changes = [labels, annotations]
  }
}
