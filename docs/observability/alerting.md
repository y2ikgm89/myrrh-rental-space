# Alerting

This project treats Cloud Monitoring alert policies in
`terraform/monitoring.tf` as version-controlled infrastructure. Thresholds
are derived from the public-surface availability SLO in
[`slo.md`](slo.md) (99.9% / 30 days, 43.2-minute error budget). The
signals below are the ones the runtime knows how to emit; anything not in
this list either has no upstream signal today or is monitored by another
surface (Cloudflare WAF, GitHub, etc).

**A merged monitoring change is not live yet.** PR CI runs `terraform validate`
only; `terraform apply` runs inside the Deploy Production workflow, which is
`workflow_dispatch` only (`.github/workflows/deploy-production.yml`, pinned by
`__tests__/unit/architecture/deploy-production-workflow.test.ts`). Merging to
`main` deploys nothing — someone has to dispatch it. Until then the GCP-side
policy keeps its previous threshold, so a new or retuned alert is silently
inactive while the repo looks correct.

## Signals

| Signal                            | Terraform resource                                             | Threshold               | SLO basis (`slo.md`)                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ReportedErrorEvent burst          | `google_monitoring_alert_policy.reported_error_burst`          | > 20 / 5 min            | 5 min of elevated HIGH/CRITICAL burns ~12% of the 43.2 min / 30d budget. Steady state is ~3–5 / 5 min                                      |
| Log severity CRITICAL             | `google_monitoring_alert_policy.severity_critical`             | any 1 log               | Settings-read CRITICAL can take every page down; one event starts budget burn                                                              |
| `/api/health` 5xx                 | `google_monitoring_alert_policy.health_probe_5xx`              | any 1 log               | Opportunistic only — nothing probes it (see below). Fires when a human opens it during an incident                                         |
| DB health probe failure           | `google_monitoring_alert_policy.db_health_probe_failure`       | > 3 / 15 min            | The actual DB-reachability detector. `/api/cron/db-health` runs `SELECT 1` every 10 min                                                    |
| Cron OIDC / config failure        | `google_monitoring_alert_policy.cron_oidc_failure`             | > 3 / 15 min            | Silent cron stop. 401 on `/api/cron/*` or AUTHORIZATION config-missing 500. Note cron 5xx **does** land in the availability SLI (`slo.md`) |
| Cron job failure (per endpoint)   | `google_monitoring_alert_policy.cron_job_failure`              | > 3 / 15 min            | One endpoint exhausting `retry_count = 3`. Cron volume (~4 events / tick) never reaches `reported-error-burst`, so nothing else sees it    |
| Prisma pool acquire-timeout       | `google_monitoring_alert_policy.prisma_pool_timeout`           | > 5 / 5 min             | Pool exhaustion turns the public surface into 5xx and burns budget in minutes                                                              |
| Google Calendar webhook sync fail | `google_monitoring_alert_policy.google_calendar_sync_failure`  | > 3 / 15 min            | Push is acked 200, so the failure never shows as a 5xx; MEDIUM `Webhook sync failed` is otherwise invisible                                |
| Mail send failure                 | `google_monitoring_alert_policy.mail_send_failure`             | > 3 / 15 min            | `sendEmail` gives up at MEDIUM so it never reaches Error Reporting; the message-prefix filter is the only signal                           |
| Public availability SLO fast burn | `google_monitoring_alert_policy.public_availability_fast_burn` | burn rate > 10 / 60 min | 30d SLO fast burn via `select_slo_burn_rate(..., "60m")`. Lookback cap is 24h, so 60m approximates the rolling window. Page now            |
| Public availability SLO slow burn | `google_monitoring_alert_policy.public_availability_slow_burn` | burn rate > 2 / 24 h    | Same SLO, `select_slo_burn_rate(..., "1440m")`. Slow budget drain — investigate next day, not a midnight page                              |

`/api/health` (admin surface) has **no prober** (audit A-29). Admin is
internal-LB + IAP: the Cloud Run probes use `/api/live`, `uptime.yml` cannot
reach the admin host, and there is no `google_monitoring_uptime_check_config`
in `terraform/`. `health_probe_5xx` therefore only evaluates when an
IAP-authenticated human opens the page. The scheduled
`/api/cron/db-health` probe is what actually detects an unreachable database;
it runs on the public surface because Cloud Scheduler cannot reach an
internal-LB service without a VPC connector, and the database is shared.

The table must stay in sync with `terraform/monitoring.tf` — every
`google_monitoring_alert_policy` there has to appear here **and** in the
threshold table in `slo.md`. Enforced by
`__tests__/unit/architecture/observability-docs-alert-names.test.ts` (audit
A-73/A-86: `slo.md` named a policy that does not exist, and two policies added
later were never documented at all).

`/api/live` is intentionally excluded — it is the Cloud Run startup / liveness
probe and is contracted to be DB-free. Alerting on it would create a feedback
loop with the container being killed by the probe itself.

## Notification channel

Email is the notification channel (`google_monitoring_notification_channel.oncall_email`).
The address is **not** committed. Set GitHub Actions secret
`MONITORING_ALERT_EMAIL_TF` and the apply job injects it as
`TF_VAR_monitoring_alert_email`.

Notification channels themselves are free. Metric-threshold policies are in
the Cloud Monitoring pricing change that starts 2027-09-01; the two
log-match policies (`severity-critical`, `health-probe-5xx`) are out of
that charge. The four metric-referencing policies are about $1 / month at
current scale.

## Runtime coupling

- **Only `logError` is observed. `logger.*` is not.** `logger-core.ts` has two
  APIs and they behave differently: `logError` writes the `@type`
  ReportedErrorEvent marker (on HIGH and CRITICAL), while the generic
  `logger.error` / `logger.warn` build a structured entry with severity but
  **no `@type` at all**. A `logger.error` therefore matches none of the five
  log metrics — not `reported_error_events` (no marker) and not
  `severity_critical` (severity is ERROR, not CRITICAL). If a failure must not
  be silent, it has to go through `logError(..., ErrorSeverity.HIGH)`; picking
  the wrong API is invisible in review because both produce a red-looking log
  line locally.
- `logger-core.ts` writes the `@type` ReportedErrorEvent marker on HIGH and
  CRITICAL severities. Any change to that marker breaks the
  `reported_error_events` log metric filter. Note that the whole structured
  JSON entry — `@type` and `severity` included — is built inside a
  `NODE_ENV === "production"` branch; outside it the logger prints a plain
  `console.error` that no filter matches. `Dockerfile` sets
  `ENV NODE_ENV=production` in the runner stage, which is what keeps this path
  live in Cloud Run.
- `logger-core.ts` maps `ErrorSeverity.CRITICAL` to Cloud Logging severity
  `CRITICAL`. Any severity table change reshapes the `severity-critical` alert.
  CRITICAL is not only hand-picked: `criticalFetch`
  (`src/shared/lib/errors/safe-fetch.ts`) promotes **any** error it catches,
  and it wraps the settings reads in
  `src/shared/domain/settings/queries/{features,site}.ts`. A transient database
  error on a page render therefore pages someone.
- **Cron handler failures are counted from the Cloud Run request log, not from
  the handler's own entry.** Every cron route logs its top-level failure at HIGH
  (pinned by `__tests__/unit/architecture/cron-failure-severity.test.ts`), but
  `context.operation` is not uniformly suffixed — `blogTrashCleanup`,
  `customerRiskScan`, `faqStaleCheck` and `notificationCleanup` carry no `Cron`
  suffix — so no stable `jsonPayload` predicate covers all 24 jobs. The
  `cron_job_failure` metric therefore filters
  `httpRequest.requestUrl=~"/api/cron/"` + `httpRequest.status>=500`, which also
  catches failures that never reach the handler's catch (container crash, OOM,
  gateway timeout). Renaming a cron path changes the metric's `request_url`
  label, which is what the alert groups by; the incident then names the new path.
  Threshold derivation: `retry_count = 3` makes one tick at most 4 requests, so
  crossing 3 in 15 minutes means the tick ultimately failed rather than one
  attempt being unlucky. This closed audit A-07 — before it, a job that failed
  every tick reached no policy at all, because `reported-error-burst` needs
  > 20 events / 5 min and cron volume tops out at ~4 per tick.
- `authorizeCronRequest()` fails closed with 401 (bad OIDC token) or 500
  (missing `CRON_OIDC_AUDIENCE` / `CRON_SERVICE_ACCOUNT_EMAIL`). The
  `cron_oidc_failure` metric counts those two emit sites only: Cloud Run
  request logs with `httpRequest.status=401` on `/api/cron/*`, plus the
  config-missing structured log (`severity="CRITICAL"` and
  `jsonPayload.category="AUTHORIZATION"`). Generic cron handler 500s are
  excluded so they cannot open the "cron OIDC failure" incident. The 401
  paths log at MEDIUM (= WARNING), so this alert is their only signal; the
  config-missing 500 path also logs at CRITICAL and therefore reaches
  `severity-critical` as well — and, because it answers 500 on `/api/cron/*`,
  `cron-job-failure` too. Paging twice for a failure that stops every job at
  once is the safe direction. Handler 500s that log HIGH land in the
  `reported_error_events` metric but never cross its 20 / 5 min threshold at
  cron volume; `cron-job-failure` is their signal.
- Pool acquire timeouts surface as plain `Error`s from node-postgres, because
  this app uses the `@prisma/adapter-pg` driver adapter and never touches the
  Rust query engine's pool. The measured messages are
  `"timeout exceeded when trying to connect"` (acquire deadline) and
  `"Connection terminated due to connection timeout"` (connect deadline);
  neither carries a Prisma error code, so `P2024` / `P2028` and
  `"Timed out fetching a new connection from the connection pool"` never
  appear. `__tests__/unit/db/prisma-pool-timeout-signal.test.ts` reproduces the
  exhaustion (no database required) and fails if the wording drifts away from
  the log metric filter.
- Google Calendar webhook sync failures after a verified token ack at
  MEDIUM (`src/app/api/webhooks/google-calendar/route.ts`, message
  `"Webhook sync failed"`, `context.operation="googleCalendarWebhook"`).
  The route returns 200 so Google does not retry; the HTTP status is
  therefore not a signal. The `google_calendar_sync_failure` log metric
  matches that emit site only. HIGH catch-path failures
  (`processing: "failed"`) already reach `reported_error_events`.
  `__tests__/unit/observability/google-calendar-sync-failure-signal.test.ts`
  reads the route and the metric filter and fails if they drift.

If any of the above emit sites changes, update `terraform/monitoring.tf` in
the same PR so the alert wiring stays honest — and remember that the PR being
merged does not push the change to GCP (see the apply note at the top).
