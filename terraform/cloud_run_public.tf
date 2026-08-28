# -----------------------------------------------------------------------------
# Cloud Run: public service (Phase 6b — env/secrets Terraform 完全移管)
# -----------------------------------------------------------------------------
#
# shape / env / secret bindings は本 file で declarative に宣言 (Phase 6b clean-break)。
# cloudbuild.yaml Step 6a は `gcloud run services update --image` (+ `--scaling=auto`)
# のみ。`--set-env-vars` / `--set-secrets` / memory/cpu/probes/ingress は触らない。
#
# ## Lifecycle policy
#
# - `template[0].containers[0].image` は cloudbuild の毎 deploy `--image` で
#   書き換え続けるため `ignore_changes` で drift 無視。
# - `template[0].revision` は Cloud Run が自動採番するため ignore。
# - shape / env は Terraform 完全管理 (ignore しない = drift-detect ON)。
# - service-level `--scaling=0` (breaking quiesce) は CB 一時操作。TF は
#   template-level min/max のみ宣言し、top-level MANUAL scaling は管理しない。
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
  # 2026-07: no `provider = google-beta` — GA in the standard "google"
  # provider (verified against the official migration guide + real-world
  # precedent, see terraform/versions.tf header comment).
  name     = "myrrh-rental-space"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account       = local.cloud_run_public_template.service_account
    execution_environment = local.cloud_run_public_template.execution_environment

    scaling {
      min_instance_count = local.cloud_run_public_template.min_instance_count
      max_instance_count = local.cloud_run_public_template.max_instance_count
    }

    max_instance_request_concurrency = local.cloud_run_public_template.max_concurrency

    # `cloud_scheduler.tf` の attempt_deadline と同値（同 file の注記参照）。
    timeout = local.cloud_run_public_template.timeout

    containers {
      image = local.cloud_run_public_template.image

      ports {
        container_port = local.cloud_run_public_template.container_port
      }

      resources {
        limits = {
          cpu    = local.cloud_run_public_template.cpu
          memory = local.cloud_run_public_template.memory
        }
        cpu_idle          = local.cloud_run_public_template.cpu_idle
        startup_cpu_boost = local.cloud_run_public_template.startup_cpu_boost
      }

      startup_probe {
        http_get {
          path = local.cloud_run_public_template.startup_probe.path
          port = local.cloud_run_public_template.container_port
        }
        initial_delay_seconds = local.cloud_run_public_template.startup_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_public_template.startup_probe.timeout_seconds
        period_seconds        = local.cloud_run_public_template.startup_probe.period_seconds
        failure_threshold     = local.cloud_run_public_template.startup_probe.failure_threshold
      }

      liveness_probe {
        http_get {
          path = local.cloud_run_public_template.liveness_probe.path
          port = local.cloud_run_public_template.container_port
        }
        initial_delay_seconds = local.cloud_run_public_template.liveness_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_public_template.liveness_probe.timeout_seconds
        period_seconds        = local.cloud_run_public_template.liveness_probe.period_seconds
        failure_threshold     = local.cloud_run_public_template.liveness_probe.failure_threshold
      }

      dynamic "env" {
        for_each = local.cloud_run_public_template.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.cloud_run_public_template.secret_versions
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
      # cloudbuild.yaml が毎 deploy で書き換える field のみ ignore。
      # Phase 6b で env は Terraform 完全管理 (ignore_changes = [env] 撤去)。
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
      # terraform-apply job は deploy job より前に走る。pin 中に修正デプロイを
      # 打つと build 完了前に traffic が壊れた LATEST へ戻る。ignore_changes は
      # この障害窓だけを消す。pin の解除は deploy 末尾の --to-latest が行う。
      traffic,
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
