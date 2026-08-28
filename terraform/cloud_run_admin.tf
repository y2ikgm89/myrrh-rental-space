# -----------------------------------------------------------------------------
# Cloud Run: admin service (Phase 6b — shape/env/secrets Terraform 完全移管)
# -----------------------------------------------------------------------------
#
# 責務は cloud_run_public.tf と同型 (CB = image + --scaling=auto のみ)。相違点:
#   - ingress: internal-and-cloud-load-balancing (external LB 経由のみ)
#   - default URL 無効化 (`default_uri_disabled = true`)
#   - IAP 経由の authenticated-only access (`iap_enabled = true` + iap.tf)
#   - env: `local.cloud_run_admin_env` (IAP_JWT_AUDIENCE + role groups が追加)

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
  # 2026-07: no `provider = google-beta` — `iap_enabled` and
  # `default_uri_disabled` (used below) were confirmed beta-only on provider
  # v6.50.0 via a real `terraform validate` run, but re-running that same
  # check against v7.40.0 confirmed they've since graduated to GA (see
  # terraform/versions.tf header comment for the full history).
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
    service_account       = local.cloud_run_admin_template.service_account
    execution_environment = local.cloud_run_admin_template.execution_environment

    scaling {
      min_instance_count = local.cloud_run_admin_template.min_instance_count
      max_instance_count = local.cloud_run_admin_template.max_instance_count
    }

    max_instance_request_concurrency = local.cloud_run_admin_template.max_concurrency

    timeout = local.cloud_run_admin_template.timeout

    containers {
      image = local.cloud_run_admin_template.image

      ports {
        container_port = local.cloud_run_admin_template.container_port
      }

      resources {
        limits = {
          cpu    = local.cloud_run_admin_template.cpu
          memory = local.cloud_run_admin_template.memory
        }
        cpu_idle          = local.cloud_run_admin_template.cpu_idle
        startup_cpu_boost = local.cloud_run_admin_template.startup_cpu_boost
      }

      startup_probe {
        http_get {
          path = local.cloud_run_admin_template.startup_probe.path
          port = local.cloud_run_admin_template.container_port
        }
        initial_delay_seconds = local.cloud_run_admin_template.startup_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_admin_template.startup_probe.timeout_seconds
        period_seconds        = local.cloud_run_admin_template.startup_probe.period_seconds
        failure_threshold     = local.cloud_run_admin_template.startup_probe.failure_threshold
      }

      liveness_probe {
        http_get {
          path = local.cloud_run_admin_template.liveness_probe.path
          port = local.cloud_run_admin_template.container_port
        }
        initial_delay_seconds = local.cloud_run_admin_template.liveness_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_admin_template.liveness_probe.timeout_seconds
        period_seconds        = local.cloud_run_admin_template.liveness_probe.period_seconds
        failure_threshold     = local.cloud_run_admin_template.liveness_probe.failure_threshold
      }

      dynamic "env" {
        for_each = local.cloud_run_admin_template.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.cloud_run_admin_template.secret_versions
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
      # `gcloud run services update` (cloudbuild.yaml の deploy step) が走ると GCP が
      # client / client_version を刻む。Terraform 側は宣言していないため、deploy の
      # たびに `-> null` の permadiff になる。実体は「最後に触った API クライアント」の
      # メタ情報で設定差ではないので ignore する。
      client,
      client_version,
      template[0].containers[0].image,
      # **`template[0].revision` は ignore しない。**
      #
      # ignore_changes は「差分を無視する」だけでなく、**prior state の値を plan に
      # 固定して送信させる**。その結果、env などを変えた update で「既存の revision
      # 名で違う設定を作れ」という要求になり、Cloud Run が 409 を返す:
      #
      #   Error 409: Revision named 'myrrh-rental-space-01023-reb' with different
      #   configuration already exists.
      #
      # 2026-08-27 の本番デプロイがこれで落ちた（cron 分離で public に env を
      # 1 つ足したのが最初の Terraform 由来 template 更新だった）。つまり
      # **public の env は Terraform 経由で変更できない状態**が潜在していた。
      #
      # 上流は google_cloud_run_v2_service に v1 の `autogenerate_revision_name`
      # 相当が無いことが原因で、issue は open のまま公式の解が無い:
      # https://github.com/hashicorp/terraform-provider-google/issues/14569
      #
      # revision を宣言せず ignore もしなければ、Terraform は名前を送らず
      # Cloud Run が採番する。cloudbuild の `gcloud run services update` が作る
      # revision と名前が衝突することもない。
      # default URL 無効化 は default_uri_disabled = true で管理。IAP は
      # 上の iap_enabled = true で管理下。
      # env は Phase 6b で Terraform 完全管理 (ignore_changes 撤去)。
      custom_audiences,
      # traffic の ignore 理由は cloud_run_public.tf と同じ。
      traffic,
    ]
  }
}
