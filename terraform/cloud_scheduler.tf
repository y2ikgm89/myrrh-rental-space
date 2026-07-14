# -----------------------------------------------------------------------------
# Cloud Scheduler (Phase 2)
# -----------------------------------------------------------------------------
#
# 全 cron エンドポイントを Cloud Scheduler で回す。Cloud Run 側 (public service)
# の /api/cron/* を OIDC token 付きで叩き、アプリ側は Bearer token の audience と
# service account email を検証する (src/shared/lib/cron-auth.ts)。
#
# 追加時は locals.cron_jobs に 1 entry 追加して PR を出す。GitHub Actions が
# terraform plan で差分を提示、merge で apply。
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
      name        = "faq-stale-check"
      schedule    = "0 9 * * 1"
      path        = "/api/cron/faq-stale-check"
      description = "Weekly stale FAQ notification (Mon 09:00 JST)"
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
      description = "PII retention purge (Session/Verification/login_attempts/Reservation.guest*/Inquiry/INACTIVE Customer, daily 03:30 JST, opt-in via feature module data-retention)"
    },
    {
      name        = "waitlist-expire"
      schedule    = "0 * * * *"
      path        = "/api/cron/waitlist-expire"
      description = "Event waitlist offer expiration (hourly). Expires WAITLISTED_OFFERED past 24h TTL and FIFO-promotes the next WAITLISTED per (slotId, ticketId). Feature-gated by events module."
    },
  ]
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
# 新規 job 追加時の運用:
#   1. `local.cron_jobs` に entry 追加 (resource 側は自動で create される)
#   2. `local.imported_cron_jobs` には追加しない (まだ GCP 側に存在しないため)
#   3. apply 完了後、以降のメンテナンスでも `imported_cron_jobs` は変更不要
#      (import block は fresh-state bootstrap 時にのみ意味を持ち、通常 apply では
#      no-op のため一過性 — 既に state に入っている resource を再 import しても skip)
# -----------------------------------------------------------------------------

# GCP 側に既に存在し、Phase 2 (setup-cloud-scheduler.sh → Terraform) の bootstrap で
# import 済みの jobs のみを列挙。新規 jobs はここに含めない (import 失敗の原因になる)。
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
    # NOTE: waitlist-expire は PR #1080 で新規追加。GCP 側に既存なしのため
    # 意図的に除外 (import{} block からは対象外、resource 側の for_each で create される)。
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

  attempt_deadline = "300s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "600s"
  }

  http_target {
    http_method = "GET"
    uri         = "${var.public_domain}${each.value.path}"

    oidc_token {
      service_account_email = var.scheduler_sa_email
      audience              = var.public_domain
    }
  }
}
