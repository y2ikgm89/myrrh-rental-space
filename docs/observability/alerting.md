# Alerting

This project treats the Cloud Monitoring alert policies under
`infra/monitoring/` as version-controlled infrastructure. The five signals
below are the ones the runtime knows how to emit; anything not in this list
either has no upstream signal today or is monitored by another surface
(Cloudflare WAF, GitHub, etc).

## Signals

| Signal                      | Config file                                                 | Threshold    | Rationale                                                                                                     |
| --------------------------- | ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| ReportedErrorEvent burst    | `infra/monitoring/alert-policies/reported-error-burst.yaml` | > 20 / 5 min | Background 4xx / retryable errors run at ~3–5 / 5 min steady state                                            |
| Log severity CRITICAL       | `infra/monitoring/alert-policies/severity-critical.yaml`    | any 1 log    | Mostly hand-picked failures, but `criticalFetch` also promotes any settings-read error (see Runtime coupling) |
| `/api/health` 5xx           | `infra/monitoring/alert-policies/health-probe-5xx.yaml`     | any 1 log    | Admin-surface DB health only (`myrrh-rental-space-admin`); public returns 404                                 |
| Cron OIDC / config failure  | `infra/monitoring/alert-policies/cron-oidc-failure.yaml`    | > 3 / 15 min | An invalid OIDC token (401) is logged at WARNING only — nothing else would surface it                         |
| Prisma pool acquire-timeout | `infra/monitoring/alert-policies/prisma-pool-timeout.yaml`  | > 5 / 5 min  | Pool exhaustion is the fastest cliff we can fall off under load                                               |

`/api/live` is intentionally excluded — it is the Cloud Run startup / liveness
probe and is contracted to be DB-free. Alerting on it would create a feedback
loop with the container being killed by the probe itself.

## Notification channel setup (one-time, per project)

Notification channels are separate resources in Cloud Monitoring. Create them
first, then reference their IDs in each alert policy YAML.

Channels have no GA surface, so this step needs the `beta` component:
`gcloud components install beta`. The policy commands further down do not —
`gcloud monitoring policies` is GA.

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

Uncommenting a template line without substituting a real channel ID is caught
by `__tests__/unit/architecture/alert-policy-no-active-replaceme.test.ts` — an
active `REPLACE_ME` line fails the build (quoted or not). Policies you are not
wiring up yet stay commented out.

## Log metric setup

Three of the five policies (`reported-error-burst`, `cron-oidc-failure`,
`prisma-pool-timeout`) count log-based metrics, so those metrics must exist
first. The other two (`severity-critical`, `health-probe-5xx`) use
`conditionMatchedLog` and need no metric.

```bash
for file in infra/monitoring/log-metrics/*.yaml; do
  gcloud logging metrics create "$(basename "$file" .yaml | tr '-' '_')" \
    --config-from-file="$file" \
    --project="$PROJECT_ID"
done
```

Re-run with `update` in place of `create` after the first apply.

## Alert policy apply

A policy with an empty `notificationChannels` list applies successfully and
then notifies nobody. Check before applying — output means "not wired":

```bash
grep -LE '^[[:space:]]*-[[:space:]]+["'"'"']?projects/' \
  infra/monitoring/alert-policies/*.yaml
```

```bash
for policy in infra/monitoring/alert-policies/*.yaml; do
  gcloud monitoring policies create \
    --project="$PROJECT_ID" \
    --policy-from-file="$policy"
done
```

To update an existing policy — Cloud Monitoring has no upsert-by-name — read
the policy back, patch the YAML, and re-post:

```bash
POLICY_NAME=$(gcloud monitoring policies list \
  --project="$PROJECT_ID" \
  --filter='displayName="myrrh-rental-space: reported error burst"' \
  --format="value(name)")

gcloud monitoring policies update "$POLICY_NAME" \
  --project="$PROJECT_ID" \
  --policy-from-file="infra/monitoring/alert-policies/reported-error-burst.yaml"
```

## Runtime coupling

- `logger-core.ts` writes the `@type` ReportedErrorEvent marker on HIGH and
  CRITICAL severities. Any change to that marker breaks the
  `reported-error-events` log metric filter. Note that the whole structured
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
- `authorizeCronRequest()` fails closed with 401 (bad OIDC token) or 500
  (missing `CRON_OIDC_AUDIENCE` / `CRON_SERVICE_ACCOUNT_EMAIL`). Both fall
  under the `cron_oidc_failure` metric filter, but they are not equally
  visible elsewhere: the 401 paths log at MEDIUM (= WARNING), so this alert is
  their only signal, while the config-missing 500 path also logs at CRITICAL
  and therefore reaches `severity-critical` as well.
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

If any of the above emit sites changes, update the matching YAML in the same
PR so the alert wiring stays honest.
