# -----------------------------------------------------------------------------
# Cloud Run: cron service
# -----------------------------------------------------------------------------
#
# Cloud Scheduler 専用の 3 台目。**public / admin と同じ image** を、
# `APP_SURFACE=public` のまま request 課金で動かす。
#
# ## なぜ分けるか（費用）
#
# public は `min_instance_count = 0` なのに 7 日間 1 秒も止まっていなかった
# （Cloud Monitoring `container/instance_count` の active が 168/168 時間、
# 0 になった時間は 0）。原因は cron が自分でサービスを起こし続けていること —
# `cloud_scheduler.tf` の 25 本が毎時 47 リクエストを撃ち、Cloud Run の idle
# 回収より短い間隔で叩き続けるため、`cpu_idle = false` の課金が 24/7 続く。
#
# 実ログ 43.2 時間の内訳は cron 2,104 件に対し実ユーザー 197 件（約 4.5 件/時）。
# cron を外せば public の稼働は 260 h/月（36% duty）まで落ちる。
#
# 設計と PR 分割は docs/superpowers/plans/2026-08-27-cron-surface-separation.md。
#
# ## `APP_SURFACE` に新しい値を作らない
#
# cron routes は既に public surface で到達可能なので、`APP_SURFACE=public` の
# まま「Scheduler だけが到達できる public のもう 1 台」にする。`src/proxy.ts`
# の blocklist も `src/shared/lib/env/server.ts` の enum も触らずに済む。
# 到達制御は IAM で行う（下の invoker binding は scheduler SA のみ。
# **`allUsers` は付けない** — ここが public との唯一の到達差）。
#
# ## `cpu_idle = true` にできる理由と、その代償
#
# public / admin が `cpu_idle = false` なのは、`src/shared/lib/async-utils.ts`
# の `fireAndForget` が Next.js `after()` にレスポンス後処理の完走を委ねており、
# その JSDoc が `--no-cpu-throttling` を明示的な前提にしているため（予約確認
# メール等の取りこぼし防止）。**この service ではその前提を捨てる。**
#
# cron にはレスポンス遅延の要件が無いので、cron route 内の `fireAndForget` は
# `await` に置き換える（plan の PR 2）。置き換えが入るまでは Scheduler の宛先を
# ここへ向けない — 本 file は追加のみで、切替は PR 3 で行う。
#
# ## なぜ singleton なのに for_each なのか
#
# 2 つの制約が交差した結果で、意匠ではない。
#
# 1. `architecture-boundaries.test.ts` の import gate は
#    `google_cloud_run_v2_service` の宣言に対し、同一 file 内の `import{}` block
#    （`to = <type>.<name>` を含む）を機械強制する。fresh-state apply の 409 対策。
# 2. Terraform の `import{}` は存在しない remote object を指すと plan が落ちる。
#    新規 resource は初回 apply までその状態にある（cloud_scheduler.tf の
#    段階 A / 段階 B の注記と同じ問題）。
#
# 1 と 2 を同時に満たすには、import を `for_each` で空集合にして無効化しつつ
# block 自体は file に置く、という secrets.tf / cloud_scheduler.tf と同じ形しか
# ない。そして **`for_each` を使う import block の `to` は `each.key` を含む
# 必要がある**（公式: "it should include each.key to distinguish between
# multiple imports"）ため、resource 側も for_each にせざるを得ない。
#
# **段階 B（初回 apply 成功後）の follow-up PR で `imported_cron_services` に
# service 名を入れること。** 忘れると tfstate 消失時の再 apply で 409 になる。

locals {
  cron_service_name = "myrrh-rental-space-cron"

  # 段階 A: GCP 側にまだ存在しないので adopt 対象は空。
  # 段階 B の follow-up PR で `toset([local.cron_service_name])` にする。
  imported_cron_services = toset([])
}

import {
  for_each = local.imported_cron_services
  to       = google_cloud_run_v2_service.cron[each.value]
  id       = "projects/${var.project_id}/locations/${var.region}/services/${each.value}"
}

resource "google_cloud_run_v2_service" "cron" {
  for_each = toset([local.cron_service_name])

  name     = each.value
  project  = var.project_id
  location = var.region

  # Cloud Scheduler は Google 内部から来るが external ingress を通る。
  # 到達制御は下の IAM invoker binding が担う（scheduler SA のみ）。
  ingress = "INGRESS_TRAFFIC_ALL"

  # **Cloud Run の URL は作成後にしか決まらないため、service が自分の `uri` を
  # 自分の env で参照すると循環参照になる。** custom audience を固定値で持つと
  # plan 時点で確定し、Scheduler 側 (`oidc_token.audience`) と app 側
  # (`CRON_OIDC_AUDIENCE`) の両方が同じ値を指せる。
  #
  # これは**トークンの `aud` 値であって到達先ではない**。`.invalid` は RFC 2606 が
  # 名前解決されないことを保証する予約 TLD で、URL と誤読されても実害が出ない。
  custom_audiences = [var.cron_oidc_audience]

  template {
    service_account       = var.runtime_sa_email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    max_instance_request_concurrency = 80

    # `cloud_scheduler.tf` の attempt_deadline と同値（同 file の注記参照）。
    timeout = "300s"

    containers {
      # image tag は cloudbuild.yaml が毎 deploy で書き換える。
      # public / admin と**同一の image**（surface は runtime env で決まる）。
      image = "asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/myrrh-rental-space:placeholder"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }

        # **ここが本 service の存在理由。** public / admin と違い request 課金に
        # する（リクエスト処理中だけ CPU が割り当てられ、その分だけ課金される）。
        cpu_idle = true

        # cpu_idle = true では cold start の頻度が上がるので boost は残す。
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

      # ---- Plain env vars ----
      dynamic "env" {
        for_each = local.cloud_run_cron_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # ---- Secret env refs (Secret Manager version pin) ----
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
      # `gcloud run services update` が刻む API クライアントのメタ情報。
      client,
      client_version,
      # cloudbuild.yaml が毎 deploy で書き換える field のみ。
      template[0].containers[0].image,
      template[0].revision,
    ]
  }
}

# **`allUsers` は付けない。** Cloud Scheduler の OIDC service account だけが
# 呼べる。public (`cloud_run_public.tf`) との唯一の到達差はこの binding。
resource "google_cloud_run_v2_service_iam_member" "cron_scheduler_invoker" {
  project  = google_cloud_run_v2_service.cron[local.cron_service_name].project
  location = google_cloud_run_v2_service.cron[local.cron_service_name].location
  name     = google_cloud_run_v2_service.cron[local.cron_service_name].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.scheduler_sa_email}"
}
