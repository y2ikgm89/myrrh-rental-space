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
  # 既存 provider (docs/gcp-production-setup.md §WIF で bootstrap 済み) の 9-key
  # mapping と一致させる (Codex P1 F3)。過去の 4-key 版は state import 後の
  # 初回 apply で mapping を "REPLACE" するため、`principalSet://.../
  # attribute.repository_id/<id>` binding が動作しなくなる drift を発生させていた。
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.actor"               = "assertion.actor"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
    "attribute.event_name"          = "assertion.event_name"
    "attribute.workflow"            = "assertion.workflow"
  }

  # attribute condition: repo lockdown に加え、rename-resistant な
  # repository_id / repository_owner_id で fork や repository rename からの
  # なりすましを封じる。ref / event_name は tf.yml plan の pull_request 経路を
  # 塞がないため意図的に外し (F4 側で job-level guard する)、docs の
  # 5-clause bootstrap のうち drift を起こさない範囲に絞る。
  #   参考: docs/gcp-production-setup.md L881
  attribute_condition = join(" && ", [
    "assertion.repository == \"${local.github_repo}\"",
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_repository_owner_id}\"",
  ])
}
