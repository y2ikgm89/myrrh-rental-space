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
  # PESSIMISTIC pin (`~> 1.15.0`) — allows 1.15.x patch releases, blocks any
  # 1.16+ minor bump. Bumped 2026-07 from a previous exact `= 1.10.0` pin
  # after a verified audit against HashiCorp's actual state-file source
  # (internal/states/statefile/) confirmed the on-disk state format (v4) has
  # not changed anywhere across the 1.10.0 -> 1.15.8 range — the earlier
  # comment's framing of this jump as a risky "one-way state format upgrade"
  # overstated the risk. 1.15.8 also carries fixes for 3 upstream Go-dependency
  # CVEs (CVE-2025-0377 go-slug, CVE-2025-22868/22872 oauth2 & net) picked up
  # since 1.10.0 — none GCS/import/provider-specific, but no reason to stay
  # frozen once confirmed safe.
  #
  # Why pessimistic (`~>`) instead of exact (`=`):
  #   - This matches HashiCorp's own guidance (their tutorials/style guide
  #     recommend `~>` precisely so patch releases — which never change state
  #     format within a minor line — don't require a config edit), rather than
  #     the previous exact pin, which wasn't something HashiCorp actually
  #     recommends.
  #   - Still fully controls the one thing that matters here: no collaborator
  #     or CI can silently jump to 1.16+ and write a state format this repo
  #     hasn't verified compatibility with.
  #   - CI (`TF_VERSION` in .github/workflows/terraform.yml and
  #     terraform-drift.yml, `terraform_version` in deploy-production.yml) still
  #     pins the literal `1.15.8` string explicitly, so the actual installed
  #     binary is identical everywhere regardless of this constraint's
  #     flexibility — this constraint is a guard rail for anyone running a
  #     different local patch version, not the thing that picks the CI binary.
  #   - Future minor-version bumps (e.g. to 1.16) remain an explicit, deliberate
  #     PR touching this file AND all three workflow files that reference the
  #     pinned version (.github/workflows/terraform.yml, terraform-drift.yml,
  #     deploy-production.yml — grep for the version string to find them),
  #     ideally preceded by a `terraform state pull` backup given there is no
  #     staging environment to rehearse against.
  #   - Still satisfies the >= 1.7 floor required by top-level `import {}`
  #     blocks (used throughout terraform/*.tf to adopt pre-existing GCP
  #     resources into state instead of erroring on 409 during fresh apply).
  required_version = "~> 1.15.0"

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
