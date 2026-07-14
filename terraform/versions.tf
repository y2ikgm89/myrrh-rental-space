# Terraform + provider version pinning.
#
# Update policy:
#   - Terraform CLI: `terraform_version` in .github/workflows/terraform.yml must match this
#   - hashicorp/google provider: pinned to major version; minor bumps via Renovate PR
#   - hashicorp/google-beta: required for google_iam_deny_policy (Deny Policies GA API
#     surface is still exposed only through the beta provider in Terraform)
terraform {
  # EXACT pin (`= 1.10.0`) — not a floor (`>= 1.10.0`).
  #
  # Why exact instead of >= :
  #   - HashiCorp official guidance recommends exact/minor pinning to prevent
  #     silent state-format upgrades on newer CLI versions (state upgrades are
  #     one-way and cannot be safely rolled back — a state written by 1.11+ can
  #     never be read by 1.10.x again, breaking any environment still on 1.10).
  #   - `>= 1.10.0` allowed local dev / any collaborator to run 1.11 / 1.12
  #     while CI (`TF_VERSION: 1.10.0` in .github/workflows/terraform.yml and
  #     Cloud Build `terraform_version: 1.10.0` in deploy-production.yml) stays
  #     locked at 1.10.0. Any local apply on a newer CLI would silently rewrite
  #     the shared remote state and lock CI out on the next plan.
  #   - Exact pin makes local + GitHub Actions + Cloud Build all agree, so the
  #     `terraform_version` marker written into the state file never changes
  #     unexpectedly. Version bumps become an explicit PR touching this file
  #     AND the two workflow files together (grep for `1.10.0` to find them).
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
