# -----------------------------------------------------------------------------
# Workload Identity Federation (Phase 5)
# -----------------------------------------------------------------------------
#
# GitHub Actions が Google Cloud SA を impersonate するための WIF Pool と
# Provider。既存 pool `github-actions` + provider `github-myrrh-rental-space` を
# `scripts/import-phase-5.sh` で state に取り込む。
#
# 参考: docs/gcp-production-setup.md の WIF setup section。

locals {
  wif_pool_id     = "github-actions"
  wif_provider_id = "github-myrrh-rental-space"
  github_repo     = "y2ikgm89/myrrh-rental-space"
}

resource "google_iam_workload_identity_pool" "github_actions" {
  project                   = var.project_id
  workload_identity_pool_id = local.wif_pool_id
  display_name              = "GitHub Actions"
  description               = "Workload Identity Pool for GitHub Actions impersonation (deploy-production.yml, terraform.yml)."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = local.wif_provider_id
  display_name                       = "GitHub — myrrh-rental-space"
  description                        = "OIDC provider bound to the repository ${local.github_repo}."

  # OIDC issuer は GitHub Actions の公式 URL 固定。
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # GitHub の JWT claims → Google の attribute mapping。
  # attribute.repository で「どの repo からの呼び出しか」を SA IAM 側で
  # principalSet を絞る根拠になる (bootstrap-terraform.sh で使用)。
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
    "attribute.ref"        = "assertion.ref"
  }

  # attribute condition: 指定 repo からの JWT のみ許容 (repository lockdown)。
  attribute_condition = "assertion.repository == \"${local.github_repo}\""
}
