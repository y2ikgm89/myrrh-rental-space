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

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_artifact_registry_repository.docker
  id = "projects/${var.project_id}/locations/${var.region}/repositories/myrrh-rental-space"
}

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
