# -----------------------------------------------------------------------------
# Artifact Registry (Phase 4)
# -----------------------------------------------------------------------------
#
# Cloud Build が push する Docker image の保管先。runner / migrator image を
# `:${SHORT_SHA}` / `:migrate-${SHORT_SHA}` / `:cache` tag で push している
# (cloudbuild.yaml Step 3)。
#
# 実運用中の repository を管理下に取るため、Phase 4 の terraform apply 前に
# `scripts/import-phase-4.sh` で state に取り込む。

resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "myrrh-rental-space"
  format        = "DOCKER"
  description   = "Cloud Build push target for public/admin Cloud Run runner + prisma-migrate migrator images."

  lifecycle {
    prevent_destroy = true
  }
}
