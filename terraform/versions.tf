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
