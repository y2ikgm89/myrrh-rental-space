# -----------------------------------------------------------------------------
# Cloud Scheduler (Phase 2)
# -----------------------------------------------------------------------------
#
# 全 cron エンドポイントを Cloud Scheduler で回す。Cloud Run 側 (public service)
# の /api/cron/* を OIDC token 付きで叩き、アプリ側は Bearer token の audience と
# service account email を検証する (src/shared/lib/cron-auth.ts)。
#
# 追加時は locals.cron_jobs に 1 entry 追加して PR を出す (段階 A)。deploy 成功後は
# 必ず follow-up PR で locals.imported_cron_jobs にも追加すること (段階 B、詳細は下部)。
# GitHub Actions が terraform plan で差分を提示、merge で apply。
#
# 既存 jobs (script 版 SSoT だったもの) は下部の `import{}` block (Terraform
# 1.7+) で fresh state 時に自動 adopt される。

locals {
  cron_jobs = [
    {
      name        = "calendar-sync"
      schedule    = "*/10 * * * *"
      path        = "/api/cron/calendar-sync"
      description = "Google Calendar bi-directional sync (poll every 10 min)"
    },
    {
      name        = "event-import"
      schedule    = "0 * * * *"
      path        = "/api/cron/event-import"
      description = "GCal event import into Event model (hourly)"
    },
    {
      name        = "faq-trash-cleanup"
      schedule    = "0 3 * * *"
      path        = "/api/cron/faq-trash-cleanup"
      description = "FAQ recycle bin 30-day auto-purge (daily 03:00 JST)"
    },
    {
      name        = "blog-trash-cleanup"
      schedule    = "0 3 * * *"
      path        = "/api/cron/blog-trash-cleanup"
      description = "Blog recycle bin 30-day auto-purge (daily 03:00 JST)"
    },
    {
      name        = "faq-stale-check"
      schedule    = "0 9 * * 1"
      path        = "/api/cron/faq-stale-check"
      description = "Weekly stale FAQ notification (Mon 09:00 JST)"
    },
    {
      name        = "customer-duplicate-scan"
      schedule    = "0 3 * * *"
      path        = "/api/cron/customer-duplicate-scan"
      description = "Daily duplicate customer detection by email/phone (daily 03:00 JST)"
    },
    {
      name        = "customer-risk-scan"
      schedule    = "0 9 * * 1"
      path        = "/api/cron/customer-risk-scan"
      description = "Weekly suspicious booking pattern detection (Mon 09:00 JST)"
    },
    {
      name        = "instagram-refresh"
      schedule    = "0 2 * * *"
      path        = "/api/cron/instagram-refresh"
      description = "Instagram long-lived token refresh (daily 02:00 JST)"
    },
    {
      name        = "instagram-sync"
      schedule    = "*/30 * * * *"
      path        = "/api/cron/instagram-sync"
      description = "Instagram feed sync (every 30 min)"
    },
    {
      name        = "notification-cleanup"
      schedule    = "0 4 * * *"
      path        = "/api/cron/notification-cleanup"
      description = "Old notification cleanup 30d+ (daily 04:00 JST)"
    },
    {
      name = "news-scheduled-publish"
      # */5 だと Neon Free の scale-to-zero（5 分 idle）が実質無効になる。
      # PUBLIC_CONTENT の revalidate 窓は 1h のため */10 でも露出遅延は十分小さい。
      schedule    = "*/10 * * * *"
      path        = "/api/cron/news-scheduled-publish"
      description = "Revalidate NEWS cache tags when a scheduled (future publishedAt) News item's publish time has just passed, bounding the cacheLife(PUBLIC_CONTENT) 1h revalidate-window exposure delay to cron interval (every 10 min, feature module news gate; avoids Neon Free always-on)"
    },
    {
      name = "blog-scheduled-publish"
      # news-scheduled-publish と同理由で */10（Neon Free scale-to-zero 維持）。
      schedule    = "*/10 * * * *"
      path        = "/api/cron/blog-scheduled-publish"
      description = "Revalidate POSTS cache tags when a scheduled (future publishedAt) Post's publish time has just passed, bounding the cacheLife(PUBLIC_CONTENT) 1h revalidate-window exposure delay to cron interval (every 10 min, feature module posts/blog gate; avoids Neon Free always-on)"
    },
    {
      name        = "reservation-reminder"
      schedule    = "0 * * * *"
      path        = "/api/cron/reservation-reminder"
      description = "Reservation reminder email dispatch (hourly)"
    },
    {
      name        = "event-reminder"
      schedule    = "0 * * * *"
      path        = "/api/cron/event-reminder"
      description = "Event reminder email dispatch (hourly, opt-in via Settings.notifyEventReminder)"
    },
    {
      name        = "smart-lock-cleanup"
      schedule    = "*/15 * * * *"
      path        = "/api/cron/smart-lock-cleanup"
      description = "SwitchBot passcode revoke for expired/cancelled reservations (every 15 min, opt-in via Settings.switchbotEnabled)"
    },
    {
      name        = "pending-reservation-expire"
      schedule    = "*/15 * * * *"
      path        = "/api/cron/pending-reservation-expire"
      description = "Auto-cancel PENDING reservations older than the fail-safe window to release EXCLUDE-lock (every 15 min, feature module reservation gate)"
    },
    {
      name        = "data-retention"
      schedule    = "30 3 * * *"
      path        = "/api/cron/data-retention"
      description = "PII retention purge (Session/Verification/Reservation.guest*/Inquiry/INACTIVE Customer, daily 03:30 JST, opt-in via feature module data-retention)"
    },
    {
      name        = "waitlist-expire"
      schedule    = "0 * * * *"
      path        = "/api/cron/waitlist-expire"
      description = "Event waitlist offer expiration (hourly). Expires WAITLISTED_OFFERED past 24h TTL and FIFO-promotes the next WAITLISTED per (slotId, ticketId). Feature-gated by events module."
    },
    {
      name        = "unpaid-event-registration-expire"
      schedule    = "*/15 * * * *"
      path        = "/api/cron/unpaid-event-registration-expire"
      description = "Auto-cancel CONFIRMED paid-ticket event registrations stuck UNPAID/PENDING/FAILED past the fail-safe window to release capacity (every 15 min, feature-gated by events module)."
    },
    {
      name        = "receipt-backfill"
      schedule    = "15 * * * *"
      path        = "/api/cron/receipt-backfill"
      description = "Reconcile missing Receipts for PAID/PARTIALLY_REFUNDED reservations & event registrations (hourly at :15 JST, feature-gated by payment module). Covers (1) historical orphans pre-dating webhook auto-issue wiring, and (2) STRIPE-03 mitigation — webhook-retry-stuck orphans where claim* succeeded but issueReceipt* threw before Stripe retry, leaving Receipt-less PAID rows since claim* early-returns on retry."
    },
    {
      name        = "calendar-sync-retry"
      schedule    = "*/15 * * * *"
      path        = "/api/cron/calendar-sync-retry"
      description = "Retry outbound Google Calendar syncs for reservations stuck with calendarSyncError (every 15 min, feature-gated by Google Calendar enabled)."
    },
    # 段階 B 完了: imported_cron_jobs に登録済 (state-rebuild 防御)
    {
      name        = "stripe-event-cleanup"
      schedule    = "0 3 * * *"
      path        = "/api/cron/stripe-event-cleanup"
      description = "StripeEvent dedup table retention (delete rows older than 90 days) + crash-recovery unblock (delete processedAt=null rows older than 10 min so Stripe retry can re-claim). Daily 03:00 JST."
    },
    # 段階 A: 監査ログ強化で apply-create. 段階 B follow-up PR で imported_cron_jobs にも登録すること (tfstate rebuild 防御)
    {
      name        = "audit-log-integrity"
      schedule    = "30 4 * * *"
      path        = "/api/cron/audit-log-integrity"
      description = "AuditLog HMAC hash-chain tamper detection (previously manual-only via SUPER_ADMIN dashboard button). Daily 04:30 JST; logs CRITICAL on failure."
    },
    # 段階 B 完了: 監査 A-29（DB 到達性が無監視）で追加。imported_cron_jobs にも登録済み (tfstate rebuild 防御)
    {
      name = "db-health"
      # */10 は news-scheduled-publish と同じ理由（Neon Free の scale-to-zero を維持）。
      # 停止検知は「初回 + retry_count = 3」で 15 分以内に 4 件へ届く設計。
      schedule    = "*/10 * * * *"
      path        = "/api/cron/db-health"
      description = "Synthetic DB reachability probe (SELECT 1 via the cron surface, every 10 min). Runs on the cron service since the scheduler cutover; it probes the database, not a specific surface. The public surface is covered externally by .github/workflows/uptime.yml (/api/live), and admin has no prober (internal-LB + IAP). Failures feed the db_health_probe_failure log metric."
    },
  ]
}

locals {
  # Exact schedules in use. No lookup() default — a new cron expression
  # is Invalid index at plan time so max_silence cannot be handwritten.
  cron_interval_seconds = {
    "*/10 * * * *" = 600
    "*/15 * * * *" = 900
    "*/30 * * * *" = 1800
    "0 * * * *"    = 3600
    "15 * * * *"   = 3600
    "0 2 * * *"    = 86400
    "0 3 * * *"    = 86400
    "30 3 * * *"   = 86400
    "0 4 * * *"    = 86400
    "30 4 * * *"   = 86400
    "0 9 * * 1"    = 604800
  }

  # heartbeat は interval ≤ 1h のジョブだけが対象。Cloud Monitoring の
  # metric-absence は trigger absence time の上限が 23.5h
  # (https://cloud.google.com/monitoring/alerts/metric-absence) で、日次ジョブは
  # **正常でも 24h 無音**なので上限内に収まらない（週次はなおさら）。日次 8 本 /
  # 週次 2 本が沈黙する事故を何が受け持つかは monitoring.tf の
  # google_monitoring_alert_policy.cron_heartbeat 冒頭に書いた。
  #
  # max_silence = interval × 2 + 900: 1 tick 丸ごとの空振りを許したうえで、次の
  # tick の retry chain の最終試行が終わる 1410s（attempt_deadline 300s × 4 +
  # backoff 30/60/120s）まで待つ。
  #
  # absence_seconds が条件に渡る値。aligned point は alignment period ごとに 1 点
  # しか出ないので、その分を引く。alignment は log-based metric の公式推奨下限
  # 10 分（"we recommend that the Rolling window menu is set to at least
  # 10 minutes" — https://cloud.google.com/monitoring/alerts/metric-absence）。
  cron_heartbeat_alignment_seconds = 600

  cron_heartbeat = {
    for j in local.cron_jobs : j.name => {
      path                = j.path
      max_silence_seconds = local.cron_interval_seconds[j.schedule] * 2 + 900
      absence_seconds     = local.cron_interval_seconds[j.schedule] * 2 + 900 - local.cron_heartbeat_alignment_seconds
    } if local.cron_interval_seconds[j.schedule] <= 3600
  }
}

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
#
# 重要 (公式仕様): Terraform の import{} block は「既存の remote object を state に
# adopt する」用途で、存在しない resource を import しようとすると
# `Cannot import non-existent remote object` エラーで plan 失敗する
# (https://developer.hashicorp.com/terraform/language/import — "Only pre-existing
# objects can be imported"). そのため import block の for_each は「adopt 対象の
# 既存 jobs」のみに絞り、新規追加した jobs は resource 側の for_each で apply-create
# させる。
#
# 新規 job 追加時の運用 (2 段階、waitlist-expire で完走した事例: PR #1080 → #1083 → 本 PR):
#
#   段階 A — 新規 job を追加する PR:
#     1. `local.cron_jobs` に entry 追加 (resource 側で apply-create される)
#     2. `local.imported_cron_jobs` には**追加しない** (GCP 側にまだ存在しないため
#        `Cannot import non-existent remote object` で plan 失敗する)
#
#   段階 B — 段階 A の apply が成功して GCP に resource が作成されたら:
#     3. **必ず follow-up PR** で `local.imported_cron_jobs` に新規 job 名を追加すること
#        (state-rebuild recovery 防御のため必須)。忘れると tfstate 消失時の再 apply で
#        「import block から skip → resource で create 試行 → 409 Already Exists」の
#        deploy block が再発する (この pattern は PR #1083 の Codex P2 review 指摘に基づく)
#
# import block は宣言的な "adopt existing resource" 構文で、一過性ではなく永続的に有効。
# tfstate が保持されている通常運用では state に既に入った resource を再 import しても
# no-op で skip されるが、state-rebuild シナリオでは import block の網羅性が正しさを担保する。
# -----------------------------------------------------------------------------

# GCP 側に既に存在し、import block による adopt 対象となる jobs を列挙。
# 新規追加した job は段階 A では除外し、apply 成功後に段階 B の follow-up PR で追加する。
locals {
  imported_cron_jobs = toset([
    "calendar-sync",
    "event-import",
    "faq-trash-cleanup",
    "faq-stale-check",
    "customer-risk-scan",
    "instagram-refresh",
    "instagram-sync",
    "notification-cleanup",
    "reservation-reminder",
    "event-reminder",
    "smart-lock-cleanup",
    "pending-reservation-expire",
    "data-retention",
    # 段階 B 完了: PR #1080 で追加 → PR #1083 で apply-create → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "waitlist-expire",
    # 段階 B 完了: Deploy Production run 30412202105 で apply-create 済み → state-rebuild 防御
    "unpaid-event-registration-expire",
    "blog-scheduled-publish",
    "blog-trash-cleanup",
    # 段階 B 完了: PR #1121 で追加 → apply-create 完了 → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "receipt-backfill",
    # 段階 B 完了: PR #1198 で追加 → apply-create 完了 → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "calendar-sync-retry",
    # 段階 B 完了: PR #1313 で追加 → apply-create 完了 (2026-07-20T10:18:42Z 本番作成確認済み) → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "audit-log-integrity",
    # 段階 B 完了: PR #1382 で追加 → apply-create 完了 (2026-07-21T15:49:53Z 本番作成確認済み、Deploy Production run 29845742054 の Terraform Apply (IAM prereq) ジョブで実確認) → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "news-scheduled-publish",
    # 段階 B 完了: cron_jobs に Stage A 追加済み → 本番 apply-create 済み → state-rebuild 防御のため imported に組み込み
    "customer-duplicate-scan",
    "stripe-event-cleanup",
    # 段階 B 完了: PR #2558（監査 A-29）で Stage A 追加 → Deploy Production
    # run 32697930171 の Terraform Apply で apply-create 完了
    # （`google_cloud_scheduler_job.job["db-health"]: Creation complete after 2s` を実確認）
    # → 本 PR (follow-up) で adopt 対象に組み込み (state-rebuild 防御)
    "db-health",
  ])
}

import {
  for_each = {
    for j in local.cron_jobs : j.name => j
    if contains(local.imported_cron_jobs, j.name)
  }
  to = google_cloud_scheduler_job.job[each.key]
  id = "projects/${var.project_id}/locations/${var.region}/jobs/${each.key}"
}

resource "google_cloud_scheduler_job" "job" {
  for_each = { for j in local.cron_jobs : j.name => j }

  name        = each.value.name
  project     = var.project_id
  region      = var.region
  description = each.value.description
  schedule    = each.value.schedule
  time_zone   = "Asia/Tokyo"

  # **一時停止を Terraform の管理下に置く。**
  #
  # 省略すると job が PAUSED になっても config と一致したままで、drift として
  # 出ない。日次 8 本・週次 2 本は `cron_heartbeat` の対象外（Cloud Monitoring の
  # metric-absence は trigger absence time の上限が 23.5h で、正常でも 24h 無音の
  # ジョブを表現できない — monitoring.tf の同 policy 冒頭）なので、**Console で
  # 誰かが停止すると誰も気づかない**状態だった。
  #
  # 明示すれば `terraform-drift.yml` の nightly plan が拾う。provider は
  # `paused` を API の `state` から導出する（`flattenCloudSchedulerJobPaused`:
  # `state == "PAUSED"` → true / `"ENABLED"` → false）ので、健全な job では
  # config と読み戻しが一致し、**永久 diff にはならない**。
  paused = false

  # **Cloud Run の request timeout（300s、`cloud_run_public.tf`）と同値。**
  # 公式は attempt_deadline を service timeout より長くすることを勧めている
  # （どちらが先に切れるかで結果が変わるため）。ここで同値のままにしているのは
  # 意図的で、理由は 2 つ:
  #
  # 1. **観測は既に決着している。** 期限切れの結果は 504（Cloud Run が先）か
  #    499（Scheduler が先）だが、`cron_job_failure` の metric filter は
  #    **両方**を数える（`monitoring.tf` の同 metric 冒頭）。どちらが出ても
  #    アラートは同じように鳴るので、決定性は運用上いらない。
  # 2. **伸ばすと検知が遅くなる。** heartbeat の `max_silence` は
  #    retry chain（attempt_deadline × 4 + backoff 210s）に連動する。
  #    300s → 360s にすると chain は 1410s → 1650s になり、interval 600s の
  #    ジョブでは max_silence を 2100s → 2250s 以上へ上げないと**正常な
  #    リトライで誤発火する**。つまり決定性と引き換えに MTTD を最低 150s 捨てる。
  #
  # 受け入れているリスクも書いておく: Scheduler が先に切った場合、handler は
  # Cloud Run 側の 300s まで走り続けうる（client は既にいない）。cron は全て
  # 冪等に書いてあるのでリトライと競合しても壊れないが、無駄な実行は起きる。
  attempt_deadline = "300s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "600s"
  }

  # **宛先は cron service（`cloud_run_cron.tf`）であって public ではない。**
  #
  # public を叩いていた頃は、この 25 本が毎時 47 リクエストを撃つせいで
  # Cloud Run の idle 回収が一度も走らず、`cpu_idle = false` の課金が 24/7
  # 続いていた（実測: instance_count の active が 168/168 時間）。cron service は
  # `cpu_idle = true` なので、同じ頻度で叩いてもリクエスト処理分しか課金されない。
  #
  # audience が service の URL ではなく `var.cron_oidc_audience` なのは、
  # Cloud Run の URL が作成後にしか決まらないため（`cloud_run_cron.tf` の
  # custom_audiences の項）。cron service 側の `CRON_OIDC_AUDIENCE` env と
  # 同じ値を指す。
  http_target {
    http_method = "GET"
    uri         = "${google_cloud_run_v2_service.cron[local.cron_service_name].uri}${each.value.path}"

    oidc_token {
      service_account_email = var.scheduler_sa_email
      audience              = var.cron_oidc_audience
    }
  }
}
