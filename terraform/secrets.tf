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
    "RESEND_WEBHOOK_SECRET",
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

  # GCP Secret Manager 側に既に存在する secret のみを列挙する。
  # `import { for_each }` は「pre-existing remote object のみ」対象にする
  # (Terraform 公式:
  # https://developer.hashicorp.com/terraform/language/block/import
  # "Only pre-existing objects can be imported.")。
  #
  # ⚠️ 新規 secret 追加の正しい 3 段階手順:
  #
  # Phase A (このタイプの PR — container 作成のみ):
  # - `runtime_secrets` / `build_secrets` に entry を追加。
  # - `imported_secrets` にはまだ入れない (Terraform 公式仕様、上の docblock)。
  # - **`terraform/variables.tf` の `cloud_run_secret_versions` にもまだ入れない**
  #   (Cloud Run env の `secret_key_ref` は "version が既に存在すること" を要求
  #   する。新 secret は container だけで version 未投入なので、同 apply cycle
  #   内で bind すると "Secret .../versions/1 was not found" で fail し main
  #   deploy が壊れる — root-fix: run 29671898405 / run 29673008431)。
  # - PR merge → `terraform apply` は container だけを create → apply pass。
  #
  # Phase B (operator manual — Terraform の外で実行、CI 経路の外):
  # - `gcloud secrets versions add <NAME> --data-file=<real-value>` で
  #   version 1 (実 value) を投入。
  #
  # Phase C (Phase B 完了後の follow-up PR — Cloud Run 配線 + 状態保全):
  # - `imported_secrets` に entry を追加 (state reset 時の re-adoption safety
  #   net を復元)。
  # - `variables.tf` の `cloud_run_secret_versions.<NAME> = "1"` を追加
  #   (Cloud Run env に secret 参照を配線)。
  # - PR merge → `terraform apply` で Cloud Run が real value を bind →
  #   該当機能 (RESEND_WEBHOOK_SECRET なら Resend webhook svix verify) 実効化。
  #
  # 逆順 (Phase A の PR で `imported_secrets` or `cloud_run_secret_versions` を
  # 同時に触る) を踏むと apply が `Cannot import non-existent remote object` or
  # `Secret .../versions/1 was not found` で fail し main deploy が blocked。
  # PR #1280 (import cascade) / PR #1283 (bootstrap attempt, reverted) /
  # このコメントを codify した PR の 3 段 saga で確立された運用契約。
  #
  # なぜ Terraform で secret_version 自動作成しないか:
  # `google_secret_manager_secret_version` を Terraform で create すると runner
  # SA に `secretmanager.versions.add` 権限が必要になり、"secret 値は Terraform
  # 対象外" (このファイル冒頭の設計原則) と "runner IAM は bootstrap-only"
  # ([[project_terraform-full-adoption-2026-07-14]]) の両規約を破ることになる。
  # 3 段階に分けて Phase B を operator 手動に留めるのが公式推奨。
  imported_secrets = toset([
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
    # RESEND_WEBHOOK_SECRET は 2026-07-19 に新規追加 (Phase A 済)。operator が
    # Phase B (`gcloud secrets versions add`) を完了したら、Phase C follow-up
    # PR でここに entry 追加 + `variables.tf` の `cloud_run_secret_versions`
    # にも `"RESEND_WEBHOOK_SECRET" = "1"` を追加。
  ])
}

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
#
# for_each は `local.imported_secrets` (= 既に GCP に存在する secret) のみを
# 対象にする。新規追加 secret はここに入れず、`terraform apply` に create
# させる。詳細は `imported_secrets` の docblock を参照。
# -----------------------------------------------------------------------------
import {
  for_each = local.imported_secrets
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
