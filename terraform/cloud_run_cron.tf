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
# **段階 B は完了済み**（`imported_cron_services` に service 名を入れた）。
# 新たに service を足すときは、同じ 2 段階を踏むこと — 段階 A で resource だけ
# 足し、apply-create の成功を確認してから段階 B で adopt 対象に入れる。

locals {
  cron_service_name = "myrrh-rental-space-cron"

  # 段階 B 完了: Deploy Production run 33094230056 の Terraform Apply で
  # apply-create 済み（`myrrh-rental-space-cron` が本番で Ready=True、
  # アプリイメージを配信していることを実確認）。tfstate 消失時の再 apply で
  # 「import から skip → resource で create → 409 Already Exists」になるのを
  # 防ぐため adopt 対象に組み込む。
  imported_cron_services = toset([local.cron_service_name])
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
    service_account       = local.cloud_run_cron_template.service_account
    execution_environment = local.cloud_run_cron_template.execution_environment

    scaling {
      min_instance_count = local.cloud_run_cron_template.min_instance_count
      max_instance_count = local.cloud_run_cron_template.max_instance_count
    }

    max_instance_request_concurrency = local.cloud_run_cron_template.max_concurrency

    # `cloud_scheduler.tf` の attempt_deadline と同値（同 file の注記参照）。
    timeout = local.cloud_run_cron_template.timeout

    containers {
      image = local.cloud_run_cron_template.image

      ports {
        container_port = local.cloud_run_cron_template.container_port
      }

      resources {
        limits = {
          cpu    = local.cloud_run_cron_template.cpu
          memory = local.cloud_run_cron_template.memory
        }
        cpu_idle          = local.cloud_run_cron_template.cpu_idle
        startup_cpu_boost = local.cloud_run_cron_template.startup_cpu_boost
      }

      startup_probe {
        http_get {
          path = local.cloud_run_cron_template.startup_probe.path
          port = local.cloud_run_cron_template.container_port
        }
        initial_delay_seconds = local.cloud_run_cron_template.startup_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_cron_template.startup_probe.timeout_seconds
        period_seconds        = local.cloud_run_cron_template.startup_probe.period_seconds
        failure_threshold     = local.cloud_run_cron_template.startup_probe.failure_threshold
      }

      liveness_probe {
        http_get {
          path = local.cloud_run_cron_template.liveness_probe.path
          port = local.cloud_run_cron_template.container_port
        }
        initial_delay_seconds = local.cloud_run_cron_template.liveness_probe.initial_delay_seconds
        timeout_seconds       = local.cloud_run_cron_template.liveness_probe.timeout_seconds
        period_seconds        = local.cloud_run_cron_template.liveness_probe.period_seconds
        failure_threshold     = local.cloud_run_cron_template.liveness_probe.failure_threshold
      }

      dynamic "env" {
        for_each = local.cloud_run_cron_template.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.cloud_run_cron_template.secret_versions
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
