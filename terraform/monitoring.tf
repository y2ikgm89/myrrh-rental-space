# Cloud Monitoring: log-based metrics, email notification channel, alert policies.
# SSoT for alerting. Apply is the `terraform-apply` job in `deploy-production.yml`,
# which is `workflow_dispatch` only — merging to main changes nothing in GCP until
# someone dispatches it (docs/observability/alerting.md says the same).
# Notification email is injected as TF_VAR_monitoring_alert_email (not committed).

resource "google_logging_metric" "reported_error_events" {
  name        = "reported_error_events"
  description = "Count of ReportedErrorEvent log entries emitted by the myrrh-rental-space runtime (both public and admin surfaces). Feeds the reported-error-burst alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name=~"^myrrh-rental-space(-admin)?$"
    jsonPayload."@type"="type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Reported error events (myrrh-rental-space)"
    labels {
      key         = "service_name"
      value_type  = "STRING"
      description = "Cloud Run service name that produced the error"
    }
  }

  label_extractors = {
    service_name = "EXTRACT(resource.labels.service_name)"
  }
}

resource "google_logging_metric" "cron_oidc_failure" {
  name        = "cron_oidc_failure"
  description = "Count of /api/cron/* OIDC bearer-token rejections (401) and authorizeCronRequest config-missing fail-closed emissions (CRITICAL + AUTHORIZATION). Generic cron handler 500s are excluded. Feeds the cron-oidc-failure alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="myrrh-rental-space"
    (
      (
        httpRequest.requestUrl=~"/api/cron/"
        httpRequest.status=401
      )
      OR
      (
        severity="CRITICAL"
        jsonPayload.category="AUTHORIZATION"
      )
    )
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Cron OIDC failures (myrrh-rental-space)"
    labels {
      key         = "request_url"
      value_type  = "STRING"
      description = "Cron endpoint URL"
    }
    labels {
      key         = "status"
      value_type  = "STRING"
      description = "HTTP status of the failed cron request"
    }
  }

  label_extractors = {
    request_url = "REGEXP_EXTRACT(httpRequest.requestUrl, \"(/api/cron/[^?]*)\")"
    status      = "EXTRACT(httpRequest.status)"
  }
}

resource "google_logging_metric" "cron_job_failure" {
  name        = "cron_job_failure"
  description = "Count of /api/cron/* Cloud Run requests that answered 5xx, labelled by endpoint. Complements cron_oidc_failure (401 / config-missing only): this one counts the handler failures that policy deliberately excludes. Feeds the cron-job-failure alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="myrrh-rental-space"
    httpRequest.requestUrl=~"/api/cron/"
    httpRequest.status>=500
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Cron job failures (myrrh-rental-space)"
    labels {
      key         = "request_url"
      value_type  = "STRING"
      description = "Cron endpoint URL — the alert groups by this so one broken job is not diluted by the other 23"
    }
    labels {
      key         = "status"
      value_type  = "STRING"
      description = "HTTP status of the failed cron request"
    }
  }

  label_extractors = {
    request_url = "REGEXP_EXTRACT(httpRequest.requestUrl, \"(/api/cron/[^?]*)\")"
    status      = "EXTRACT(httpRequest.status)"
  }
}

resource "google_logging_metric" "prisma_pool_timeout" {
  name        = "prisma_pool_timeout"
  description = "Count of Prisma connection pool acquire timeouts / pool exhaustion signals from the myrrh-rental-space runtime. Feeds the prisma-pool-timeout alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name=~"^myrrh-rental-space(-admin)?$"
    (
      textPayload:"timeout exceeded when trying to connect"
      OR jsonPayload.message:"timeout exceeded when trying to connect"
      OR jsonPayload.message:"Connection terminated due to connection timeout"
      OR jsonPayload.context.operation="prismaPool"
    )
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Prisma pool acquire timeouts (myrrh-rental-space)"
    labels {
      key         = "service_name"
      value_type  = "STRING"
      description = "Cloud Run service name that produced the error"
    }
  }

  label_extractors = {
    service_name = "EXTRACT(resource.labels.service_name)"
  }
}

resource "google_monitoring_notification_channel" "oncall_email" {
  display_name = "myrrh oncall email"
  type         = "email"
  labels = {
    email_address = var.monitoring_alert_email
  }
}

# SLO: docs/observability/slo.md (public 99.9% / 30d, budget 43.2 min).
# 20 events / 5 min is a burst: ~12% of the 30-day budget if the surface is 5xx
# for those 5 minutes. Steady state is ~3-5 / 5 min.
resource "google_monitoring_alert_policy" "reported_error_burst" {
  display_name = "myrrh-rental-space: reported error burst"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      A burst of ReportedErrorEvent log entries was emitted by the myrrh-rental-space
      runtime. Investigate at:

      - Cloud Error Reporting: https://console.cloud.google.com/errors
      - Cloud Logging (raw): filter for
        `resource.type="cloud_run_revision"` AND
        `jsonPayload."@type"="type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"`

      Common causes: fresh deploy regression, upstream API outage (Cloudflare / Stripe / Google APIs),
      Prisma pool contention (see `prisma-pool-timeout` alert). Escalate to the on-call runbook if
      the alert stays firing after a rollback.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "reported error events > 20 / 5 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/reported_error_events"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 20
      # 監査 A-30: **`duration` は 0s**。`duration` は「違反状態を維持すべき時間」で、
      # `alignment_period` と同じ 300s を入れると整列後の点が 2 点連続で閾値超えに
      # ならない限りインシデントが開かない（＝バースト開始から約 10 分）。
      # 5 分のバーストでバジェットの 12% を焼く形を検知するのが目的なのに、
      # その形だけが抜けていた。他の 3 ポリシー（cron_oidc_failure /
      # prisma_pool_timeout / google_calendar_sync_failure）はすべて 0s。
      duration = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["metric.label.service_name"]
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.reported_error_events]
}

# SLO: docs/observability/slo.md. CRITICAL settings-read failures take every
# page down; one event starts error-budget burn, so page on the first log.
resource "google_monitoring_alert_policy" "severity_critical" {
  display_name = "myrrh-rental-space: CRITICAL severity log"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      The myrrh-rental-space runtime emitted a log line at severity=CRITICAL.
      Most CRITICAL call sites are irrecoverable domain-level failures (audit log
      integrity violation, cron config missing). `criticalFetch` additionally promotes
      any error raised while reading site/feature settings, so a transient
      database error on a page render also appears here. Either way one
      occurrence is worth escalating — those settings reads gate every page.

      Open the incident in Cloud Logging and follow the runbook the message points to.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "any CRITICAL log entry"
    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name=~"^myrrh-rental-space(-admin)?$"
        severity="CRITICAL"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "3600s"
  }
}

# SLO: docs/observability/slo.md. Admin /api/health is a leading indicator for
# public 5xx (DB unreachable), not the public SLO probe itself. Page on any 1.
#
# 監査 A-29: **これは定期プローブではない。** admin は internal LB + IAP で、
# Cloud Run probe（`/api/live`）も外形監視（uptime.yml）も uptime check も
# `/api/health` を叩かないので、IAP 認証済みの人が手で開いた瞬間にしか
# 評価対象のログが生まれない。DB 到達性の定期検知は下の
# `db_health_probe_failure`（`/api/cron/db-health`）が担う。こちらは「人が見ているときに
# 即座に鳴る」日和見の signal として残す。
resource "google_monitoring_alert_policy" "health_probe_5xx" {
  display_name = "myrrh-rental-space: /api/health 5xx"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      Admin-surface `/api/health` is returning 5xx. This endpoint is gated to
      `APP_SURFACE=admin` (public returns 404) and exercises DB round-trip. A
      single 5xx means either the database is unreachable, a credential is
      missing, or the admin runtime is in a bad state. Unauthenticated public
      probes are not a signal — use `/api/live` + Prisma pool / CRITICAL alerts
      for anonymous uptime.

      Investigation order:
      1. Cloud Run revision (myrrh-rental-space-admin) — is the freshly deployed
         revision serving? Recent migrate-execute failure?
      2. Prisma pool timeout alert — running at the same time?
      3. Cloudflare / R2 credential rotation — startup probe (`assertCloudflareCredentials`)
         fails visibly on cold-start when either is missing.

      Runbook pointer: docs/gcp-production-setup.md and docs/observability/alerting.md.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "/api/health returned 5xx"
    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="myrrh-rental-space-admin"
        httpRequest.requestUrl=~"/api/health($|\\?)"
        httpRequest.status>=500
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "3600s"
  }
}

# Outside the public availability SLO (docs/observability/slo.md). Silent cron
# stop; 3 / 15 min filters a single retry from a real config/OIDC outage.
resource "google_monitoring_alert_policy" "cron_oidc_failure" {
  display_name = "myrrh-rental-space: cron OIDC failure"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      A cron endpoint (/api/cron/*) failed OIDC bearer token verification or the
      fail-closed cron-config check. Silent failures here mean scheduled jobs
      stopped running with no other symptom.

      This alert does **not** fire on generic cron handler 500s (Instagram sync,
      Prisma, mail, …). Those belong to `cron-job-failure`, which counts 5xx
      request logs per endpoint. Keeping the two apart means an incident titled
      "cron OIDC failure" always means authentication or configuration, never a
      handler bug.

      One overlap is deliberate: the config-missing branch answers 500, so a
      missing `CRON_OIDC_AUDIENCE` / `CRON_SERVICE_ACCOUNT_EMAIL` opens both
      incidents. That failure stops every job at once, and paging twice for a
      total outage is the safe direction.

      Diagnose:

      1. Cloud Logging: either
         `httpRequest.requestUrl=~"/api/cron/"` + `httpRequest.status=401`
         (bad / missing OIDC token) or
         `severity="CRITICAL"` + `jsonPayload.category="AUTHORIZATION"`
         (missing `CRON_OIDC_AUDIENCE` / `CRON_SERVICE_ACCOUNT_EMAIL`).
      2. Compare `CRON_OIDC_AUDIENCE` and `CRON_SERVICE_ACCOUNT_EMAIL` in the
         running revision against the Cloud Scheduler job config
         (`terraform/cloud_scheduler.tf` — `locals.cron_jobs` and the
         `oidc_token` block are the SSoT).
      3. Runbook: docs/gcp-production-setup.md → "Cloud Scheduler".
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "cron OIDC / config failures > 3 / 15 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/cron_oidc_failure"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.cron_oidc_failure]
}

# Outside the public availability SLO shape but inside the SLI (cron 5xx counts —
# docs/observability/slo.md). Closes audit A-07: before this policy nothing fired
# when a single cron endpoint failed every tick.
resource "google_monitoring_alert_policy" "cron_job_failure" {
  display_name = "myrrh-rental-space: cron job failure"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      A single `/api/cron/*` endpoint exhausted Cloud Scheduler's retries. The
      job did not run this tick, and unless the next tick recovers it will keep
      not running. The endpoint is in the incident's `request_url` label.

      **Why 3 / 15 min.** `retry_config.retry_count = 3`
      (`terraform/cloud_scheduler.tf`) means one tick is at most 4 requests:
      the initial attempt plus 3 retries, with 30s/60s/120s backoff, so a fully
      failed tick lands 4 events inside the 15-minute window. A blip the retry
      recovers from stops at 1 or 2. Crossing 3 therefore means "the tick
      ultimately failed", not "one attempt was unlucky". Same derivation as
      `db-health-probe-failure`, which is that rule applied to one endpoint.

      **Why grouped by `request_url`.** Without grouping, two unrelated jobs each
      losing 2 attempts would sum to 4 and page for an outage that did not
      happen; and the incident would not say which job broke. With grouping,
      the threshold is per endpoint and the incident names it.

      **Why request logs rather than the handler's own log.** Every cron route
      logs its top-level failure at HIGH
      (`__tests__/unit/architecture/cron-failure-severity.test.ts` pins that),
      but `context.operation` is not uniformly suffixed — `blogTrashCleanup`,
      `customerRiskScan`, `faqStaleCheck` and `notificationCleanup` carry no
      `Cron` suffix — so no stable jsonPayload predicate covers all 24 jobs.
      The Cloud Run request log does, and it also catches failures that never
      reach the handler's catch at all (container crash, OOM, gateway timeout).

      Relationship to the other policies:

      - `reported-error-burst` (>20 / 5 min) cannot see this. Cron volume tops
        out at ~4 events per tick, so a job failing forever never reaches it.
        That gap is the reason this policy exists (audit A-07).
      - `cron-oidc-failure` covers 401 and the config-missing 500 only.
      - `db-health-probe-failure` watches `/api/cron/db-health` through the
        probe's own message. A db-health 5xx opens both; that is intended —
        one says "the DB is unreachable", this one says "the endpoint is 5xx".

      Diagnose:

      1. Cloud Logging, scoped to the endpoint from the incident label:
         `httpRequest.requestUrl=~"/api/cron/<job>" AND httpRequest.status>=500`.
      2. The handler's own entry for the same request carries the cause:
         `jsonPayload."@type"=~"ReportedErrorEvent"` plus
         `jsonPayload.context.operation`.
      3. Cloud Scheduler console — confirm the job is still enabled and its
         last attempt matches. `terraform/cloud_scheduler.tf` is the SSoT for
         schedule and retry policy.
      4. A job that is failing because a feature module is off is a bug, not a
         config choice: the feature gate is expected to short-circuit with 200.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "cron endpoint 5xx > 3 / 15 min (per endpoint)"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/cron_job_failure"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["metric.label.request_url"]
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.cron_job_failure]
}

# SLO: docs/observability/slo.md. Pool exhaustion turns the public surface into
# 5xx and burns the 43.2 min budget in minutes. 5 / 5 min is the cliff.
resource "google_monitoring_alert_policy" "prisma_pool_timeout" {
  display_name = "myrrh-rental-space: Prisma pool acquire timeout"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      Prisma is timing out while acquiring a connection from the pool. Either
      Postgres is unreachable / saturated, our `DATABASE_POOL_MAX` is too small
      for current traffic, or a long-running transaction is starving the pool.

      Investigate:

      1. Cloud SQL / Postgres metrics: connections in use, replication lag.
      2. Recent deploys: did `DATABASE_POOL_MAX` change? Did we add a long
         transaction (`prisma.$transaction` with slow work inside)?
      3. Correlate with `Reported error events` — spike in one is often
         driven by the other.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "pool acquire timeouts > 5 / 5 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/prisma_pool_timeout"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.prisma_pool_timeout]
}

resource "google_logging_metric" "google_calendar_sync_failure" {
  name        = "google_calendar_sync_failure"
  description = "Count of Google Calendar webhook sync failures that ack 200 (re-delivery suppression) and log MEDIUM. Feeds the google-calendar-sync-failure alert policy. HIGH catch-path failures already reach reported_error_events."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name=~"^myrrh-rental-space(-admin)?$"
    jsonPayload.context.operation="googleCalendarWebhook"
    jsonPayload.message:"Webhook sync failed"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Google Calendar webhook sync failures (myrrh-rental-space)"
    labels {
      key         = "service_name"
      value_type  = "STRING"
      description = "Cloud Run service name that produced the error"
    }
  }

  label_extractors = {
    service_name = "EXTRACT(resource.labels.service_name)"
  }
}

# Outside the public availability SLO (docs/observability/slo.md). The route
# returns 200 on purpose; 3 / 15 min is the only page for MEDIUM sync failure.
resource "google_monitoring_alert_policy" "google_calendar_sync_failure" {
  display_name = "myrrh-rental-space: Google Calendar webhook sync failure"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      `/api/webhooks/google-calendar` acknowledged a verified Google push
      (HTTP 200) but `syncFromCalendar` failed. The 200 is intentional —
      Google retries on non-2xx and a retry storm would amplify the
      failure. The sync itself did not apply.

      Investigate:

      1. Cloud Logging: `resource.type="cloud_run_revision"` and
         `jsonPayload.context.operation="googleCalendarWebhook"` and
         `jsonPayload.message:"Webhook sync failed"`.
      2. Admin settings → Integrations → Calendar: connection status and
         last error message (`IntegrationHealth` for GOOGLE_CALENDAR).
      3. Recovery: cron `/api/cron/calendar-sync` (or a manual sync from
         the two-way-sync section) re-runs the same `syncFromCalendar`.
         Auth / config failures become IntegrationHealth ERROR immediately;
         transient failures need 3 consecutive records.

      This alert does **not** fire on ignored / lock-skipped notifications
      (`ignored`, `skipped: lock_unavailable`). Those are ack-and-defer
      by design.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "google calendar webhook sync failures > 3 / 15 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/google_calendar_sync_failure"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.google_calendar_sync_failure]
}

# -----------------------------------------------------------------------------
# Public Cloud Run availability SLO (docs/observability/slo.md)
# request_count has no path label — /api/live may appear in the denominator.
# -----------------------------------------------------------------------------

resource "google_monitoring_service" "public_cloud_run" {
  service_id   = "myrrh-rental-space-public"
  display_name = "myrrh-rental-space (public Cloud Run)"

  basic_service {
    service_type = "CLOUD_RUN"
    service_labels = {
      service_name = "myrrh-rental-space"
      location     = var.region
    }
  }
}

resource "google_monitoring_slo" "public_availability" {
  service      = google_monitoring_service.public_cloud_run.service_id
  slo_id       = "public-availability-999"
  display_name = "Public availability 99.9% / 30d"

  goal                = 0.999
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      good_service_filter  = <<-EOT
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.label.service_name="myrrh-rental-space"
        metric.label.response_code_class!="5xx"
      EOT
      total_service_filter = <<-EOT
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.label.service_name="myrrh-rental-space"
      EOT
    }
  }
}

# Web Vitals (consent-gated server action → structured log). No public /api/metrics.
resource "google_logging_metric" "mail_send_failure" {
  name        = "mail_send_failure"
  description = "Count of terminal Resend send failures. `sendEmail` logs MEDIUM (the caller decides whether the flow can continue), so these never reach reported_error_events. Feeds the mail-send-failure alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name=~"^myrrh-rental-space(-admin)?$"
    jsonPayload.category="EXTERNAL_API"
    jsonPayload.message=~"^Mail send failed"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Mail send failures (myrrh-rental-space)"
  }
}

resource "google_monitoring_alert_policy" "mail_send_failure" {
  display_name = "myrrh-rental-space: mail send failure"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      `sendEmail` exhausted its retries and gave up. The message was not
      delivered. Confirmation mails, receipts and inquiry replies all go
      through this path.

      These are logged at MEDIUM on purpose — the caller decides whether the
      surrounding flow can continue without the mail — so they never reach
      Error Reporting or `reported_error_events`. This policy is the only
      signal (same shape as google-calendar-sync-failure).

      Investigate:

      1. Cloud Logging: `jsonPayload.message=~"^Mail send failed"`. The message
         carries the underlying cause after the prefix (the provider's own
         message, or the sender-misconfiguration remediation text). The context
         carries `stage` (payload / provider / throw) and `operation` (which mail).
      2. Admin settings → Integrations → Resend: connection status and last
         error (`IntegrationHealth` for RESEND).
      3. A rotated / revoked `RESEND_API_KEY` or a broken sending-domain DNS
         record makes every send fail; a single bounce does not.

      This alert does **not** fire on suppressed recipients (logged at LOW,
      `reason: "suppressed"`). Those are intentional drops.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "mail send failures > 3 / 15 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/mail_send_failure"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.mail_send_failure]
}

# 監査 A-29: admin `/api/health` を叩く主体がリポジトリ内に存在しないため、
# 上の health_probe_5xx は人が手で開いた瞬間にしか評価されない。DB 到達性の
# 独立した検知経路として、公開面の `/api/cron/db-health` が `SELECT 1` を打つ。
# 3 / 15 min は cron_oidc_failure と同じ導出 —— Cloud Scheduler の retry_count = 3 が
# あるので、リトライで復帰するブリップは 1〜2 件、使い切る本物の停止だけが 4 件に届く。
resource "google_logging_metric" "db_health_probe_failure" {
  name        = "db_health_probe_failure"
  description = "Count of scheduled DB reachability probe failures (/api/cron/db-health). Logged HIGH, so a single blip also lands in reported_error_events — but that policy's 20 / 5 min burst threshold never fires on cron volume. Feeds the db-health-probe alert policy."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="myrrh-rental-space"
    jsonPayload.category="DATABASE"
    jsonPayload.message=~"^Database health probe failed"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "DB health probe failures (myrrh-rental-space)"
  }
}

resource "google_monitoring_alert_policy" "db_health_probe_failure" {
  display_name = "myrrh-rental-space: DB health probe failure"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      The scheduled DB reachability probe (`/api/cron/db-health`, every 10 min)
      exhausted Cloud Scheduler's retries. `SELECT 1` is not getting through,
      which means Neon (Postgres) is unreachable from Cloud Run.

      This is the **only** independent detector for that condition. `/api/health`
      on the admin surface is never probed (admin is internal-LB + IAP, and the
      repo has no uptime check that can reach it), and the public surface reads
      settings through `'use cache'`, so it keeps serving from cache until the
      entries expire.

      Investigate:

      1. Neon console — is the project suspended, over quota, or mid-maintenance?
      2. Prisma pool acquire-timeout alert — firing at the same time means the
         pool is exhausted rather than the database being gone.
      3. Cloud Run revision (myrrh-rental-space) — a rotated `DATABASE_URL`
         secret shows up here first, before any user-facing 5xx.
      4. Cloud Logging: `jsonPayload.message=~"^Database health probe failed"`.
         The driver's own message follows the prefix.

      A single failure that the scheduler's retry recovers from does **not**
      reach this threshold — that is deliberate (Neon Free scale-to-zero makes
      the occasional cold-start blip normal).
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "db health probe failures > 3 / 15 min"
    condition_threshold {
      filter          = <<-EOT
        metric.type="logging.googleapis.com/user/db_health_probe_failure"
        resource.type="cloud_run_revision"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_logging_metric.db_health_probe_failure]
}

resource "google_logging_metric" "web_vitals" {
  name        = "web_vitals"
  description = "Core Web Vitals samples logged by the public surface after analytics consent (jsonPayload.message=web_vital). Labels carry metric name only — no URL/UA."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="myrrh-rental-space"
    jsonPayload.message="web_vital"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "DISTRIBUTION"
    unit         = "ms"
    display_name = "Web Vitals (myrrh-rental-space)"
    labels {
      key         = "metric"
      value_type  = "STRING"
      description = "Vital name: CLS, INP, LCP, FCP, or TTFB"
    }
  }

  value_extractor = "EXTRACT(jsonPayload.context.value)"
  label_extractors = {
    metric = "EXTRACT(jsonPayload.context.metric)"
  }

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 2
      scale              = 0.01
    }
  }
}

# SLO burn-rate alerts: docs/observability/slo.md. `select_slo_burn_rate` lookback
# cannot exceed 24h, so the 30-day rolling SLO is approximated with 60m (fast) and
# 1440m (slow). Fast = page now; slow = investigate next day.
resource "google_monitoring_alert_policy" "public_availability_fast_burn" {
  display_name = "myrrh-rental-space: public availability SLO fast burn"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      The public-surface availability SLO (`public-availability-999`, 99.9% / 30d)
      is burning error budget fast. `select_slo_burn_rate(..., "60m") > 10` means
      the last hour is on pace to exhaust the 43.2-minute budget in roughly three
      days — page immediately.

      Cloud Monitoring caps burn-rate lookback at 24h, so this is the fast window
      on the 30-day SLO (not a separate 1-hour SLO).

      Investigate:

      1. Cloud Run revision `myrrh-rental-space` — recent deploy? rollback candidate?
      2. `reported-error-burst` / `prisma-pool-timeout` — same incident often fires
         here first; this alert catches sustained 5xx that those burst detectors miss.
      3. Cloud Monitoring SLO dashboard for `public-availability-999` — good/total
         ratio and remaining budget.
      4. Cloud Logging: `httpRequest.status>=500` on the public service.

      Pair with `public-availability-slow-burn` for gradual budget drain (24h window).
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "public availability SLO fast burn rate > 10 (60m)"
    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.public_availability.name}\", \"60m\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 10
      duration        = "0s"
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  depends_on = [google_monitoring_slo.public_availability]
}

resource "google_monitoring_alert_policy" "public_availability_slow_burn" {
  display_name = "myrrh-rental-space: public availability SLO slow burn"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.oncall_email.name,
  ]

  documentation {
    content   = <<-EOT
      The public-surface availability SLO is draining budget slowly. `select_slo_burn_rate(...,
      "1440m") > 2` means the last 24 hours are on pace to miss the 30-day 99.9% goal
      — investigate on the next business day, not a middle-of-the-night page.

      1440m is the longest lookback Cloud Monitoring allows; it approximates a slow
      burn on the 30-day rolling SLO rather than a literal 30-day average.

      Investigate:

      1. SLO dashboard — is error budget trending down without a single spike?
      2. Intermittent 5xx (Neon cold start, upstream blips) that never tripped
         `reported-error-burst` but add up over a day.
      3. Cron traffic in the SLI denominator (`slo.md`) — a flaky job can dilute
         availability without a human-visible outage.
      4. If `public-availability-fast-burn` also fired, treat as one incident.

      `auto_close = 86400s` so a resolved slow burn does not linger.
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "public availability SLO slow burn rate > 2 (24h)"
    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.public_availability.name}\", \"1440m\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
    }
  }

  alert_strategy {
    auto_close = "86400s"
  }

  depends_on = [google_monitoring_slo.public_availability]
}
