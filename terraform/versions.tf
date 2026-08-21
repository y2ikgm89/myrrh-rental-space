# Terraform + provider version pinning.
#
# Update policy:
#   - Terraform CLI: `terraform_version` in .github/workflows/terraform.yml must match this
#   - hashicorp/google: pinned to major version 7 (bumped from 6.x 2026-07 —
#     v6 has been frozen at 6.50.0 for ~10 months with zero further releases,
#     i.e. de facto unmaintained; v7.0.0 shipped 2025-08-26, current latest is
#     7.40.0). Floor pinned at `~> 7.40` (NOT `~> 7.0`) specifically to
#     exclude the v7.0.0-7.3.x range, which has a confirmed real panic bug in
#     google_cloud_scheduler_job when http_target.headers is omitted (this
#     repo's cloud_scheduler.tf omits it for all 19 jobs) — GitHub
#     hashicorp/terraform-provider-google#24354, fixed in v7.4.0. `~> 7.40`
#     mirrors this file's existing 2-component floor-pin convention (like the
#     prior `~> 6.14`) and matches the "minor bumps via Renovate PR" policy.
#   - Exhaustively cross-checked the official v7.0.0 upgrade guide
#     (https://registry.terraform.io/providers/hashicorp/google/latest/docs/guides/version_7_upgrade)
#     against every resource type actually declared in terraform/*.tf: of
#     the ~33 breaking changes/removed-resources/removed-fields listed, NONE
#     touch a resource type this repo uses (no AlloyDB / Bigtable / BigQuery /
#     Cloud Functions / Compute instance templates / GKE Hub / Cloud SQL /
#     Storage bucket / Vertex AI / etc. anywhere in this config) — so no
#     `.tf` resource attribute needed renaming, removing, or retyping for
#     this migration. The Terraform CLI protocol requirement (protocol 5.0)
#     is unchanged across the v6→v7 boundary, so this does not require the
#     separate Terraform CLI version bump tracked in a different PR.
#   - hashicorp/google-beta: REMOVED entirely (2026-07). A prior 2026-07 audit
#     on provider v6.50.0 found google_cloud_run_v2_service.admin's
#     `iap_enabled` and `default_uri_disabled` were still rejected as
#     unsupported arguments on the standard "google" provider (verified via
#     an actual `terraform validate` run, not docs/source reading), so
#     google-beta was kept for just that one resource while the other 3
#     (google_cloud_run_v2_service.public, google_cloud_run_v2_job.prisma_migrate,
#     google_compute_managed_ssl_certificate.admin_cert) had `provider =
#     google-beta` dropped in a separate PR. Re-running that same
#     `terraform validate` check against the newly-pinned v7.40.0 confirmed
#     `iap_enabled`/`default_uri_disabled` have since graduated to GA — so
#     `provider = google-beta` was dropped from the admin service too, and
#     the google-beta requirement removed from this file entirely. If a
#     future resource genuinely needs a beta-only field, re-add google-beta
#     to required_providers then (and verify with a real `terraform validate`
#     against the pinned provider version, not just reading provider docs —
#     that step is what caught the actual GA/beta boundary both times).
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
  required_version = "~> 1.15.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.44"
    }
    # Cloudflare provider — Phase 8 (myrrh-jp.com zone を Terraform 化).
    #
    # `~> 5.22` = v5 major に pin (5.x の範囲で minor bump は許可、v6 major bump は拒否)。
    #
    # **`~> 5` と書かない。** 意味は同じだが、Renovate の `rangeStrategy: "bump"` は
    # 1 要素の `~> 5` を bump できず `>= 5.23.0` へ書き換えてしまい、**上限が消える**
    # (2026-08-11、PR #2142 で実際に生成された)。`google` 側の `~> 7.40` のように
    # 2 要素で書いておけば `~> 5.23` の形で bump され、v6 拒否が維持される。
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
      version = "~> 5.23"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
