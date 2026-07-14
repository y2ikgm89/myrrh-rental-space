# -----------------------------------------------------------------------------
# Cloud Run: public service (Phase 6b — env/secrets Terraform 完全移管)
# -----------------------------------------------------------------------------
#
# env / secret bindings は本 file で declarative に宣言 (Phase 6b、2026-07-14 完成)。
# cloudbuild.yaml Step 6a の `--set-env-vars=` / `--set-secrets=` は削除済で、
# 毎 deploy が触るのは image tag (`--image=...:${SHORT_SHA}`) のみ。
#
# ## Lifecycle policy
#
# - `template[0].containers[0].image` は cloudbuild.yaml の毎 deploy `--image` で
#   書き換え続けるため `ignore_changes` で drift 無視。
# - `template[0].revision` は Cloud Run が自動採番するため ignore。
# - `env` は Terraform 完全管理 (Phase 6b で ignore_changes 撤去、drift-detect ON)。
# - `prevent_destroy = true` で Terraform apply が service を消す事故は無条件 block。
#
# ## env の source of truth
#
# - plain env: `terraform/locals_cloud_run.tf` の `local.cloud_run_public_env`
# - secret refs: `terraform/secrets.tf` の `google_secret_manager_secret.secret[<id>]`
#   version pinning は `var.cloud_run_secret_versions` (secret_id → version map)

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_cloud_run_v2_service.public
  id = "projects/${var.project_id}/locations/${var.region}/services/myrrh-rental-space"
}

resource "google_cloud_run_v2_service" "public" {
  provider = google-beta

  name     = "myrrh-rental-space"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

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

      # ---- Plain env vars (Phase 6b) ----
      dynamic "env" {
        for_each = local.cloud_run_public_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # ---- Secret env refs (Phase 6b、Secret Manager version pin) ----
      dynamic "env" {
        for_each = var.cloud_run_secret_versions
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secret[env.key].secret_id
              version = env.value
            }
          }
        }
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
      # cloudbuild.yaml が毎 deploy で書き換える field のみ ignore。
      # Phase 6b で env は Terraform 完全管理 (ignore_changes = [env] 撤去)。
      template[0].containers[0].image,
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
