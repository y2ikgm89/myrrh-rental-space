# Terraform + provider version pinning.
#
# Update policy:
#   - Terraform CLI: `terraform_version` in .github/workflows/terraform.yml must match this
#   - hashicorp/google provider: pinned to major version; minor bumps via Renovate PR
#   - hashicorp/google-beta: required for google_iam_deny_policy (Deny Policies GA API
#     surface is still exposed only through the beta provider in Terraform)
terraform {
  required_version = ">= 1.10.0"

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
