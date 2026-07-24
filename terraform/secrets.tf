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
    # RESEND_WEBHOOK_SECRET: Tier 2 (Settings DB) 完了。ここへ戻さない。
    # state forget は下の `removed` block。GCP SM 削除は operator 手順
    # (docs/runbooks/gcp-dead-resource-cleanup.md)。
    "SUPPRESSION_HASH_SECRET",
    # 手順 1 (PR-a) のみ完了: container だけ作成。operator の版投入 (手順 2) と
    # Cloud Run 配線 + imported_secrets 追加 (手順 3, PR-b) は follow-up。
    # 3 段階手順は本ファイル末尾のコメントを参照。
    "R2_INQUIRIES_BUCKET_NAME",
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
    # Phase C (2026-07-24): versions/1 ENABLED 確認済み。Cloud Run 配線は
    # var.cloud_run_secret_versions。state-rebuild 時の再 adoption 用に登録。
    "SUPPRESSION_HASH_SECRET",
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

# Tier 2 移行済みの RESEND_WEBHOOK_SECRET を state から forget（GCP 側は残す）。
# `removed` は for_each インスタンスキーを直接受け付けない
# (Error: Resource instance keys not allowed — hashicorp/terraform#34439)。
# 回避策: moved で flat アドレスへ移してから removed { destroy = false }。
# この apply 成功後に operator が `gcloud secrets delete RESEND_WEBHOOK_SECRET`。
# （先に SM を消して config に残すと次 apply が空 container を再作成する。）
moved {
  from = google_secret_manager_secret.secret["RESEND_WEBHOOK_SECRET"]
  to   = google_secret_manager_secret.resend_webhook_secret_forgotten
}

removed {
  from = google_secret_manager_secret.resend_webhook_secret_forgotten

  lifecycle {
    destroy = false
  }
}

# -----------------------------------------------------------------------------
# 新規 secret 追加の operator フロー (bootstrap resource 廃止)
# -----------------------------------------------------------------------------
# PR #1283 で導入された `google_secret_manager_secret_version.bootstrap` は
# `scripts/bootstrap-terraform.sh` の IAM Deny Policy
# (`block-terraform-runner-secret-value-read`, Codex P1 #1053 / F2 / F7) と
# 設計矛盾する。terraform-runner SA は `secretmanager.googleapis.com/versions.add`
# を deny 拒否されており、bootstrap version resource の CREATE は必ず 403 で失敗する。
#
# structural closure の SSoT は「terraform は container のみ扱う、versions は
# operator が gcloud で投入する」であり、これを尊重する。新規 secret を追加する
# 手順は以下 3 段階 (PR 1 本には収まらない — 2 PR + operator 介入が必須):
#
# **手順 1: 新規 container 追加 (PR-a)**
#   - `runtime_secrets` (or `build_secrets`) に新 entry を追加。
#   - `cloud_run_common_env` / `cloud_run_public_env` / `cloud_run_admin_env` の
#     いずれかに `secret_key_ref` を **追加しない** (この段階では版が無いため refresh fail する)。
#   - この PR を merge → terraform apply で container のみが作成される (versions は空)。
#
# **手順 2: operator が版を投入**
#   ```
#   printf '%s' '<real-value>' | \
#     gcloud secrets versions add <NAME> --project=myrrh-rental-space --data-file=-
#   ```
#
# **手順 3: Cloud Run 配線 + imported_secrets 追加 (PR-b)**
#   - `cloud_run_common_env` 等に `secret_key_ref` を追加。
#   - `imported_secrets` に entry を追加 (次回 state 消失時の再 adoption 用)。
#   - `cloud_run_secret_versions` map の pin を `"1"` (最初の版) に設定。
#   - この PR を merge → terraform apply で Cloud Run が secret を読み込む。
#
# 既存の PR-D (#1269, RESEND_WEBHOOK_SECRET) や PR-K (#1276, SUPPRESSION_HASH_SECRET)
# のように 1 PR で container 追加と Cloud Run 配線を同時に行うと、follow-up PR +
# operator の版投入が必要になる。
#
# RESEND_WEBHOOK_SECRET: Tier 2 完了。`removed { destroy = false }` で state forget。
# GCP SM 削除は operator（docs/runbooks/gcp-dead-resource-cleanup.md）。
# SUPPRESSION_HASH_SECRET: Phase C 完了（cloud_run_secret_versions + imported_secrets）。
