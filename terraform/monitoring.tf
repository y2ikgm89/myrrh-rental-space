# Cloud Monitoring: log-based metrics, email notification channel, alert policies.
# SSoT for alerting. Apply is main-merge CI (`deploy-production.yml` terraform-apply).
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
      duration        = "300s"
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
      Most CRITICAL call sites are irrecoverable domain-level failures (mail send
      failure that cannot retry, audit log integrity violation, encryption key
      unavailable, cron config missing). `criticalFetch` additionally promotes
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
      Prisma, mail, …). Those stay on reported-error-burst / severity-critical.

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
