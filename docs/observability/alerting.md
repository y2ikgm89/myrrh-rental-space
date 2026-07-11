# Alerting

This project treats the Cloud Monitoring alert policies under
`infra/monitoring/` as version-controlled infrastructure. The five signals
below are the ones the runtime knows how to emit; anything not in this list
either has no upstream signal today or is monitored by another surface
(Cloudflare WAF, GitHub, etc).

## Signals

| Signal                      | Config file                                                 | Threshold    | Rationale                                                          |
| --------------------------- | ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| ReportedErrorEvent burst    | `infra/monitoring/alert-policies/reported-error-burst.yaml` | > 20 / 5 min | Background 4xx / retryable errors run at ~3–5 / 5 min steady state |
| Log severity CRITICAL       | `infra/monitoring/alert-policies/severity-critical.yaml`    | any 1 log    | Reserved for irrecoverable domain-level failures; page immediately |
| `/api/health` 5xx           | `infra/monitoring/alert-policies/health-probe-5xx.yaml`     | any 1 log    | Health checks DB + Cloudflare + R2; a 5xx is always meaningful     |
| Cron OIDC / config failure  | `infra/monitoring/alert-policies/cron-oidc-failure.yaml`    | > 3 / 15 min | Cloud Scheduler retries silently — this is the only signal         |
| Prisma pool acquire-timeout | `infra/monitoring/alert-policies/prisma-pool-timeout.yaml`  | > 5 / 5 min  | Pool exhaustion is the fastest cliff we can fall off under load    |

`/api/live` is intentionally excluded — it is the Cloud Run startup / liveness
probe and is contracted to be DB-free. Alerting on it would create a feedback
loop with the container being killed by the probe itself.

## Notification channel setup (one-time, per project)

Notification channels are separate resources in Cloud Monitoring. Create them
first, then reference their IDs in each alert policy YAML.

```sh
# List existing channels (they may already exist from prior setup)
gcloud beta monitoring channels list \
  --project="$PROJECT_ID" \
  --format="table(name,displayName,type)"

# If a channel is missing, create it. Email is the minimum viable path;
# add Slack / PagerDuty as your team grows.
gcloud beta monitoring channels create \
  --project="$PROJECT_ID" \
  --display-name="myrrh oncall email" \
  --type="email" \
  --channel-labels="email_address=oncall@example.com"

# Copy the returned resource name (projects/<id>/notificationChannels/<n>)
# into every alert policy YAML under `notificationChannels:` before applying.
```

## Log metric setup

Two alert policies depend on log-based counter metrics. Create them before
the policies that reference them:

```sh
for metric in reported_error_events prisma_pool_timeout cron_oidc_failure; do
  gcloud logging metrics create "$metric" \
    --config-from-file="infra/monitoring/log-metrics/${metric//_/-}.yaml" \
    --project="$PROJECT_ID"
done
```

Re-run with `update` in place of `create` after the first apply.

## Alert policy apply

```sh
for policy in infra/monitoring/alert-policies/*.yaml; do
  gcloud alpha monitoring policies create \
    --project="$PROJECT_ID" \
    --policy-from-file="$policy"
done
```

To update an existing policy — Cloud Monitoring has no upsert-by-name — read
the policy back, patch the YAML, and re-post:

```sh
POLICY_NAME=$(gcloud alpha monitoring policies list \
  --project="$PROJECT_ID" \
  --filter='displayName="myrrh-rental-space: reported error burst"' \
  --format="value(name)")

gcloud alpha monitoring policies update "$POLICY_NAME" \
  --project="$PROJECT_ID" \
  --policy-from-file="infra/monitoring/alert-policies/reported-error-burst.yaml"
```

## Runtime coupling

- `logger-core.ts` writes the `@type` ReportedErrorEvent marker on HIGH and
  CRITICAL severities. Any change to that marker breaks the
  `reported-error-events` log metric filter.
- `logger-core.ts` maps `ErrorSeverity.CRITICAL` to Cloud Logging severity
  `CRITICAL`. Any severity table change reshapes the
  `severity-critical` alert.
- `authorizeCronRequest()` fails closed with 401 (bad OIDC token) or 500
  (missing `CRON_OIDC_AUDIENCE` / `CRON_SERVICE_ACCOUNT_EMAIL`). Both fall
  under the `cron_oidc_failure` metric filter.
- Prisma emits the exact string
  `"Timed out fetching a new connection from the connection pool"` when the
  pg-pool acquire deadline hits. Do not paraphrase the error in a wrapper —
  the log metric filter matches that literal string.

If any of the above emit sites changes, update the matching YAML in the same
PR so the alert wiring stays honest.
