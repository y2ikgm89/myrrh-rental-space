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
  # runtime_secrets と build_secrets の union (重複除去)。
  all_secrets = toset(concat(local.runtime_secrets, local.build_secrets))
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
