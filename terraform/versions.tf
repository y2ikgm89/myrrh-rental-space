# Terraform + provider version pinning.
#
# Update policy:
#   - Terraform CLI: `terraform_version` in .github/workflows/terraform.yml must match this
#   - hashicorp/google provider: pinned to major version; minor bumps via Renovate PR
#   - hashicorp/google-beta: required ONLY by google_cloud_run_v2_service.admin
#     (cloud_run_admin.tf), specifically for its `iap_enabled` and
#     `default_uri_disabled` arguments. 2026-07 audit: verified via an actual
#     `terraform validate` run against the real pinned google provider
#     v6.50.0 (not just reading provider source) that these two arguments are
#     still rejected as unsupported on the standard "google" provider's
#     google_cloud_run_v2_service schema — the resource TYPE is GA, but these
#     two specific attributes are not (yet). The other 3 resources that
#     previously declared `provider = google-beta` — google_cloud_run_v2_service.public
#     (cloud_run_public.tf), google_cloud_run_v2_job.prisma_migrate
#     (cloud_run_migrate_job.tf), and google_compute_managed_ssl_certificate.admin_cert
#     (lb_admin.tf) — validated cleanly on the standard "google" provider and
#     had their `provider = google-beta` line dropped. Re-check with a real
#     `terraform validate` (not just docs/source reading) before dropping the
#     remaining google-beta requirement in a future provider bump.
terraform {
  # EXACT pin (`= 1.10.0`) — not a floor (`>= 1.10.0`).
  #
  # Why exact instead of >= :
  #   - This is a project-specific choice, not something HashiCorp's own
  #     guidance recommends (HashiCorp's tutorials/style guide actually favor
  #     a pessimistic constraint like `~> 1.10` for exactly this scenario, to
  #     avoid needing a config edit for every patch release). We pin exact
  #     here because CI (`TF_VERSION: 1.10.0` in .github/workflows/terraform.yml
  #     and terraform-drift.yml, `terraform_version: 1.10.0` in
  #     deploy-production.yml) and any local `terraform apply` against the
  #     shared GCS state must resolve to the byte-identical Terraform binary.
  #     State upgrades are one-way and cannot be safely rolled back — a state
  #     written by 1.11+ can never be read by 1.10.x again — so `>= 1.10.0`
  #     would let a collaborator's newer local CLI silently rewrite the shared
  #     remote state and lock CI out on the next plan.
  #   - Exact pin makes local + GitHub Actions all agree, so the
  #     `terraform_version` marker written into the state file never changes
  #     unexpectedly. Version bumps become an explicit PR touching this file
  #     AND all three workflow files that reference `1.10.0`
  #     (.github/workflows/terraform.yml, terraform-drift.yml,
  #     deploy-production.yml — grep for `1.10.0` to find them) together,
  #     plus a state backup beforehand given the one-way upgrade risk.
  #   - Still satisfies the >= 1.7 floor required by top-level `import {}`
  #     blocks (used throughout terraform/*.tf to adopt pre-existing GCP
  #     resources into state instead of erroring on 409 during fresh apply).
  required_version = "= 1.10.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.14"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.14"
    }
    # Cloudflare provider — Phase 8 (myrrh-jp.com zone を Terraform 化).
    #
    # `~> 5` = v5 major に pin (5.x の範囲で minor bump は許可、v6 major bump は拒否)。
    # v5 は v4 からの完全な breaking rewrite:
    #   - 全 resource が個別属性ベースに分解 (例:
    #     `cloudflare_zone_settings_override` → `cloudflare_zone_setting × N`)
    #   - `cloudflare_record` → `cloudflare_dns_record` (schema 完全再設計)
    #   - `cloudflare_ruleset` (Cache Rules / Transform Rules) の rules block 構造刷新
    #
    # 本 project は v5 syntax で 0 から書き起こす (v4 → v5 の in-place migration は
    # 行わない、`import {}` blocks 経由で existing state を新 schema へ adopt する)。
    # 参考: https://developers.cloudflare.com/terraform/advanced-topics/version-5-upgrade/
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
