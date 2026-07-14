# -----------------------------------------------------------------------------
# Cloud Run Job: prisma-migrate (Phase 6b — env/secrets Terraform 完全移管)
# -----------------------------------------------------------------------------
#
# cloudbuild.yaml Step 4 (migrate-update) の `--set-secrets=DATABASE_URL=...` は
# 削除済で、Terraform が secret binding の SSoT (Phase 6b、2026-07-14 完成)。
# Step 4 の残り (image / memory / command / args) も Terraform で declarative に
# 宣言し、Cloud Build は `--image=...:migrate-${SHORT_SHA}` の image tag update
# のみを実施する契約。Step 5b (migrate-execute) は job execute のみで env 変更なし。

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_cloud_run_v2_job.prisma_migrate
  id = "projects/${var.project_id}/locations/${var.region}/jobs/prisma-migrate"
}

resource "google_cloud_run_v2_job" "prisma_migrate" {
  provider = google-beta

  name     = "prisma-migrate"
  project  = var.project_id
  location = var.region

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account       = var.runtime_sa_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      timeout     = "600s"
      max_retries = 0

      containers {
        image = "asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/myrrh-rental-space:migrate-placeholder"

        command = ["bunx"]
        args    = ["--bun", "prisma", "migrate", "deploy"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        # migrate Job は Prisma DATABASE_URL のみ必要 (他の env / secret は不要)。
        # Cloud Run service 側と同じ Secret Manager container + version pinning。
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secret["DATABASE_URL"].secret_id
              version = var.cloud_run_secret_versions["DATABASE_URL"]
            }
          }
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      # image tag は Cloud Build が毎 deploy で書き換える (`--image=...:migrate-${SHORT_SHA}`)。
      # env は Phase 6b で Terraform 完全管理 (ignore_changes 撤去)。
      template[0].template[0].containers[0].image,
    ]
  }
}
