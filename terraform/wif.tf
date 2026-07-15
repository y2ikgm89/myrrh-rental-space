# -----------------------------------------------------------------------------
# Workload Identity Federation (Phase 5)
# -----------------------------------------------------------------------------
#
# GitHub Actions が Google Cloud SA を impersonate するための WIF Pool と
# Provider。既存 pool `github-actions` + provider `github-myrrh-rental-space` は
# 本 file 下部の `import{}` block で fresh state 時に自動 hydration される
# (Terraform 1.7+)。
#
# 参考: docs/gcp-production-setup.md の WIF setup section。

locals {
  wif_pool_id     = "github-actions"
  wif_provider_id = "github-myrrh-rental-space"
  github_repo     = "y2ikgm89/myrrh-rental-space"
}

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_iam_workload_identity_pool.github_actions
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/${local.wif_pool_id}"
}

import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/${local.wif_pool_id}/providers/${local.wif_provider_id}"
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

  # attribute condition (5-clause 完全版、2026-07-15 audit gap fix):
  #
  # 1. repository name lockdown (rename 前の識別)
  # 2. repository_id lockdown (rename-resistant、fork 詐称防御)
  # 3. repository_owner_id lockdown (owner rename-resistant)
  # 4. ref == 'refs/heads/main' (branch-based abuse 防御 = malicious branch push で
  #    build-sa impersonation ができない)
  # 5. event_name in ('push', 'workflow_dispatch') (pull_request event での cloud
  #    impersonation を物理的に閉じる、F4 hardening と多重防御)
  #
  # Note on quote style: WIF condition の CEL は double / single quote 両方許容
  # だが、`scripts/audit-gcp-production-iap.ts` の `readWifProviderConditionErrors`
  # が fragment 文字列一致で single quote を要求するため、**single quote に統一**。
  #
  # PR-triggered workflow (terraform.yml validate、check-main-terraform-health.yml)
  # は WIF auth を使わない (`terraform init -backend=false` + `terraform validate` +
  # gh CLI のみ) ため、この condition tightening で真の break はしない。
  #
  # 参考:
  #   - Google 公式 WIF best practices: https://cloud.google.com/iam/docs/best-practices-for-using-and-managing-workload-identity-federation
  #   - GitHub OIDC docs: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
  attribute_condition = join(" && ", [
    "assertion.repository == '${local.github_repo}'",
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_repository_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
    "(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')",
  ])
}
