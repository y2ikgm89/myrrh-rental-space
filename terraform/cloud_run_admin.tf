# -----------------------------------------------------------------------------
# Cloud Run: admin service (Phase 6a skeleton)
# -----------------------------------------------------------------------------
#
# 責務は cloud_run_public.tf と同型 (Phase 6a skeleton, Phase 6b で env/secrets 移管)。
# 相違点:
#   - ingress: internal-and-cloud-load-balancing (external LB 経由のみ)
#   - default URL 無効化 (`default_uri_disabled = true`)。cloudbuild.yaml Step 6b
#     が revision ごとに `--no-default-url` を再適用していたが、Terraform 側で
#     宣言することで再 import 後の apply が黙って default URL を復活させる
#     regression を防ぐ (docs/gcp-production-setup.md §admin service)。
#   - IAP 経由の authenticated-only access (`iap_enabled = true` + iap.tf の
#     `google_iap_web_cloud_run_service_iam_member`)

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_cloud_run_v2_service.admin
  id = "projects/${var.project_id}/locations/${var.region}/services/myrrh-rental-space-admin"
}

resource "google_cloud_run_v2_service" "admin" {
  provider = google-beta

  name     = "myrrh-rental-space-admin"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  # Cloud Run direct IAP (docs/gcp-production-setup.md §admin service)。
  # LB backend service には IAP を張らない契約 (同 docs L990-992)。
  # 初回 setup で `gcloud run services update ... --iap` 実施済み。
  # ここで宣言することで、再 import 後の apply が黙って IAP を無効化する
  # regression (Codex P1 #1063 follow-up) を防ぐ。
  iap_enabled = true

  # default *.run.app URI を無効化 (`--no-default-url` 相当)。docs L115-118 /
  # L925-931: admin は LB + IAP 経由でのみ到達可能とする契約。cloudbuild.yaml
  # が revision ごとに再適用しているが、Terraform 側で宣言することで再 import
  # 後の apply による regression を防ぐ。
  default_uri_disabled = true

  template {
    service_account       = var.runtime_sa_email
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
      # default URL 無効化 は default_uri_disabled = true で管理。IAP は
      # 上の iap_enabled = true で管理下。
      custom_audiences,
    ]
  }
}
