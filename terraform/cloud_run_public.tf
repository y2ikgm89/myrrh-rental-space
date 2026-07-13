# -----------------------------------------------------------------------------
# Cloud Run: public service (Phase 6a skeleton)
# -----------------------------------------------------------------------------
#
# 現状 cloudbuild.yaml Step 6a が `gcloud run deploy` で shape 込みで宣言的に
# 毎 deploy 反映している。本 Phase 6a では **shape のうち可搬性の高い部分だけ**
# を Terraform で宣言し、image / detail env vars / secret bindings の細部は
# Phase 6b で cloudbuild.yaml の相当パラメータと入れ替える (別 PR)。
#
# Phase 6a の trade-off:
#   - `template[0].containers[0].image` は毎 deploy の Cloud Build が書き換え
#     続けるため `lifecycle.ignore_changes` で drift を無視する。
#   - env vars / secret bindings は Phase 6b で Terraform 側に完全移管する
#     まで、暫定的に ignore_changes で cloudbuild.yaml 側の書き込みを許容する。
#
# `prevent_destroy = true` で Terraform apply が service を消す事故は無条件 block。

resource "google_cloud_run_v2_service" "public" {
  provider = google-beta

  name     = "myrrh-rental-space"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account       = google_service_account.sa["runtime"].email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    max_instance_request_concurrency = 80

    timeout = "300s"

    containers {
      # image tag は cloudbuild.yaml が毎 deploy で `--image=...:${SHORT_SHA}`
      # で書き換える。Terraform 上は placeholder を残し、ignore_changes で
      # drift を無視する。
      image = "asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/myrrh-rental-space:placeholder"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = false
        startup_cpu_boost = true
      }

      startup_probe {
        http_get {
          path = "/api/live"
          port = 8080
        }
        initial_delay_seconds = 0
        timeout_seconds       = 1
        period_seconds        = 10
        failure_threshold     = 9
      }

      liveness_probe {
        http_get {
          path = "/api/live"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 1
        period_seconds        = 30
        failure_threshold     = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      # cloudbuild.yaml が毎 deploy で書き換えるフィールド。Phase 6b で
      # Terraform 側に完全移管したら本 list を絞る。
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].revision,
    ]
  }
}

# Public service は unauthenticated access を許容する (allUsers に run.invoker)。
resource "google_cloud_run_v2_service_iam_member" "public_allow_unauthenticated" {
  project  = google_cloud_run_v2_service.public.project
  location = google_cloud_run_v2_service.public.location
  name     = google_cloud_run_v2_service.public.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
