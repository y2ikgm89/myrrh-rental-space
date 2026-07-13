# -----------------------------------------------------------------------------
# Cloud Run Job: prisma-migrate (Phase 6a skeleton)
# -----------------------------------------------------------------------------
#
# 現在 cloudbuild.yaml Step 4 (migrate-update) が `gcloud run jobs update` で
# image / memory / command / args / DATABASE_URL secret を宣言的に再適用し、
# Step 5b (migrate-execute) が `gcloud run jobs execute --wait` で実行する。
#
# Phase 6a では Terraform 側で Job resource の shape を宣言し、image は
# cloudbuild.yaml が毎 deploy で書き換え続ける (`--image=...:migrate-${SHORT_SHA}`)。
# Phase 6b で cloudbuild.yaml Step 4 を削除し Terraform apply に完全移管する。

resource "google_cloud_run_v2_job" "prisma_migrate" {
  provider = google-beta

  name     = "prisma-migrate"
  project  = var.project_id
  location = var.region

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account       = google_service_account.sa["runtime"].email
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
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      template[0].template[0].containers[0].image,
      template[0].template[0].containers[0].env,
    ]
  }
}
