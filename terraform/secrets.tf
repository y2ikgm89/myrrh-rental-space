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
  # ⚠️ 新規 secret 追加の正しい 2 段階手順:
  # 1. `runtime_secrets` / `build_secrets` に entry を追加してこの PR を merge。
  #    `imported_secrets` にはまだ入れない → `terraform apply` は import では
  #    なく create として扱い、GCP 側に新 container が作られる。
  #    (Post-merge operator action: `gcloud secrets versions add <NAME>
  #    --data-file=<file>` で値を投入)
  # 2. `terraform apply` 成功後 (= main deploy 緑) の follow-up PR で
  #    `imported_secrets` にも同 entry を追加。state 消失時の再 adoption
  #    safety net が復活する。
  #
  # 逆手順 (最初から `imported_secrets` に入れる) を踏むと plan 段階で
  # "Cannot import non-existent remote object" で fail し main deploy が
  # blocked になる (root-fix commit: このコメント追加の commit を参照)。
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
    # RESEND_WEBHOOK_SECRET は 2026-07-19 に新規追加。first `terraform apply`
    # 成功 (= GCP 側に container 作成完了) 後の follow-up PR でここに追加する。
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

# -----------------------------------------------------------------------------
# Bootstrap placeholder version for newly-added secrets
# -----------------------------------------------------------------------------
# Cloud Run service (`google_cloud_run_v2_service.{public,admin}`) は
# `variables.tf` の `cloud_run_secret_versions` map で pin された version
# (通常 "1") を `secret_key_ref` として要求する。新規 secret container を
# 作成した直後は operator が実 value を投入していないため version 1 が
# 存在せず、apply が
#     Error: spec.template.spec.containers[0].env[N].value_from
#       .secret_key_ref.name: Secret ... /versions/1 was not found
# で fail してしまう卵と鶏問題を回避する (root-fix: run 29671898405)。
#
# 対象は `setsubtract(all_secrets, imported_secrets)` = 新規追加 secret の
# みで、既存 (imported_secrets 収録済) の secret はそのまま — operator が
# 既に実 value を投入しているため触らない。
#
# lifecycle.ignore_changes = [secret_data, enabled] により、operator が
# 後から `gcloud secrets versions add <NAME> --data-file=<real>` で新
# version を投入して古い placeholder version を disable しても、次回
# terraform apply が「戻し」に来ない (real value を上書きしない safety net)。
#
# ⚠️ operator による webhook 実効化フロー:
# 1. この PR merge 済 → `terraform apply` で placeholder version 1 が作成
#    される (main deploy 復旧)。
# 2. operator が
#      gcloud secrets versions add <NAME> --data-file=<real-value>
#    で version 2 (real value) を投入。
# 3. follow-up PR で `terraform/variables.tf` の `cloud_run_secret_versions`
#    の該当 entry を "2" (or "latest") に更新 → apply で Cloud Run が
#    real value を読み込む。
# 4. 該当 secret が消費される機能 (RESEND_WEBHOOK_SECRET なら Resend
#    webhook) が復旧する。

resource "google_secret_manager_secret_version" "bootstrap" {
  for_each = setsubtract(local.all_secrets, local.imported_secrets)

  secret      = google_secret_manager_secret.secret[each.value].id
  secret_data = "bootstrap-placeholder-please-rotate"

  lifecycle {
    ignore_changes = [secret_data, enabled]
  }
}
