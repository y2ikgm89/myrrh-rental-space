# -----------------------------------------------------------------------------
# Cloud Run: admin service (Phase 6a skeleton)
# -----------------------------------------------------------------------------
#
# 責務は cloud_run_public.tf と同型 (Phase 6a skeleton, Phase 6b で env/secrets 移管)。
# 相違点:
#   - ingress: internal-and-cloud-load-balancing (external LB 経由のみ)
#   - default URL 無効化 (Terraform 側は `custom_audiences` などで再現できない
#     ため、cloudbuild.yaml Step 6b が担っていた `--no-default-url` を revision
#     ごとに反映する必要がある。Phase 6b でこの点も整理する)
#   - IAP 経由の authenticated-only access (roles/run.invoker for IAP group)

resource "google_cloud_run_v2_service" "admin" {
  provider = google-beta

  name     = "myrrh-rental-space-admin"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

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
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].revision,
      # IAP + default URL 無効化は Phase 6b / 7 で細調整する。
      custom_audiences,
    ]
  }
}
