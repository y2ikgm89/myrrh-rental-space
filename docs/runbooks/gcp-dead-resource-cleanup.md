# Dead GCP resource cleanup

## Status (2026-08-22)

All three orphaned resources documented below are **gone from GCP**:

| Resource | Status |
| -------- | ------ |
| `CRON_SECRET` (Secret Manager) | Deleted (GCP `NOT_FOUND`) |
| `calendar-sync@…` (service account) | Deleted (GCP `NOT_FOUND`) |
| `RESEND_WEBHOOK_SECRET` (Secret Manager) | Deleted 2026-08-22 after Cloud Run unbound verification. TF `moved`/`removed` scaffolding removed in follow-up PR |

Historical §1–§3 keep the exact delete procedures for audit trail. Do not recreate these resources.

---

## Background (historical)

Three Google Cloud resources were orphaned in `myrrh-rental-space` after
upstream migrations landed on `main` and never re-adopted them:

- **`CRON_SECRET` (Secret Manager)** — shared bearer token for `/api/cron/*`,
  dead since the Cloud Scheduler OIDC migration.
- **`calendar-sync@myrrh-rental-space.iam.gserviceaccount.com` (service
  account)** — impersonation identity for the retired Google Calendar OAuth
  integration.
- **`RESEND_WEBHOOK_SECRET` (Secret Manager)** — Resend bounce/complaint
  webhook signing secret. Production canonical is the Settings DB
  (`SettingsResend.resendWebhookSecret`). The env name remains a local-dev
  fallback; deleting the Secret Manager container is not the same as deleting
  the env name from code.

`CRON_SECRET` and `calendar-sync@` had zero runtime references in the
repository (gates: `cron-oidc-clean-break.test.ts`,
`gcp-production-audit.test.ts`). Deleting the orphans dropped unused attack
surface.

This runbook was a checklist for a **project owner running gcloud from their
own workstation**. The Claude harness does not hold the IAM roles required
to delete Secret Manager secrets or user-managed service accounts, so the
delete commands below had to be executed by a human.

## Prerequisites

- `gcloud` installed and authenticated as a `myrrh-rental-space` project owner
  (or any principal that holds `roles/secretmanager.admin` **and**
  `roles/iam.serviceAccountAdmin` on the project).
- Environment set to the production project:

  ```bash
  export PROJECT_ID=myrrh-rental-space
  gcloud config set project "$PROJECT_ID"
  ```

  ```powershell
  $env:PROJECT_ID = "myrrh-rental-space"
  gcloud config set project $env:PROJECT_ID
  ```

- Working copy of `y2ikgm89/myrrh-rental-space` at latest `main` for the
  in-repository verification greps.

---

## 1. `CRON_SECRET` (Secret Manager)

### Background

Cloud Scheduler no longer sends a shared bearer token to `/api/cron/*`. The
OIDC clean-break landed as part of the Cloud Scheduler + `cron-auth.ts`
refactor: schedulers acquire an OIDC ID token from
`myrrh-rental-space-scheduler@…` and the route handler verifies the token via
`authorizeCronRequest()` (audience + service-account email). No runtime path
reads `CRON_SECRET` any more, and the audit script explicitly rejects the env
name (`scripts/audit-gcp-production-iap.ts`,
`forbiddenCloudRunRuntimeEnvNames`). The runbook already documents
`CRON_SECRET` as forbidden in Cloud Run runtime env
(`docs/gcp-production-setup.md`, "Legacy clean-break names").

The only remaining trace is the standalone `CRON_SECRET` container in Secret
Manager, which no service reads and no build binds.

### Pre-delete verification (in-repo, 0 hits expected)

Run from the repository root. Every command must return **only test fixtures
or documentation** — no runtime `import`, no `--set-secrets=` line, no
Terraform / Cloud Build binding.

```bash
# Full repository scan. Expected hits (all evidence of the clean break, not usage):
#   docs/gcp-production-setup.md      — documents that the name is forbidden
#   docs/runbooks/gcp-dead-resource-cleanup.md — this runbook
#   __tests__/unit/architecture/cron-oidc-clean-break.test.ts
#   __tests__/unit/architecture/gcp-production-audit.test.ts
#   __tests__/unit/architecture/gcp-production-runbook.test.ts
#   __tests__/unit/architecture/env-example-clean-break.test.ts
#   __tests__/unit/architecture/deploy-production-workflow.test.ts
#   scripts/audit-gcp-production-iap.ts (forbidden-names list)
#   terraform/README.md               — 「関連 runbook」から本 runbook へのリンク
# Any hit outside that set (src/**, cloudbuild.yaml, terraform/**, .env*, etc.) means
# the secret is still wired somewhere — STOP and re-audit before deleting.
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' CRON_SECRET

# Explicit "must not appear here" checks (any hit blocks deletion):
# 実 config だけを見る。散文（.md）は「消したことを書いた記録」なので必ず当たり、
# ここに含めると停止条件が永久に成立してしまう。
rg CRON_SECRET src/
rg CRON_SECRET cloudbuild.yaml
rg CRON_SECRET terraform/ --glob '!**/*.md'
```

```powershell
# PowerShell equivalent — same expected-hits rule as above.
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' CRON_SECRET

rg CRON_SECRET src/
rg CRON_SECRET cloudbuild.yaml
rg CRON_SECRET terraform/ --glob '!**/*.md'
```

If any hit lands outside the allowed set, stop. Either the OIDC migration
was reverted or a new code path adopted the legacy name — either way, do not
delete the secret until the reference is removed.

### Pre-delete verification (Cloud Run runtime env, 0 bindings expected)

`|| echo "clean"` は使わない — `gcloud` 自体が失敗しても出力が空になり、
`grep` が空振りして `clean` が出る（fail-open）。終了コードを明示的に見る。

```bash
TMP=$(mktemp)

gcloud run services describe myrrh-rental-space \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F CRON_SECRET "$TMP" && { echo "STILL BOUND — do not delete"; exit 1; }
echo "clean"

gcloud run services describe myrrh-rental-space-admin \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F CRON_SECRET "$TMP" && { echo "STILL BOUND — do not delete"; exit 1; }
echo "clean"
```

Both invocations must print `clean`. The production audit
(`bun run gcp:audit-production-iap`) also asserts this via
`forbiddenCloudRunRuntimeEnvNames`; if the audit already passes, this is a
belt-and-suspenders confirmation.

### Delete

```bash
gcloud secrets delete CRON_SECRET --project="$PROJECT_ID"
```

```powershell
gcloud secrets delete CRON_SECRET --project=$env:PROJECT_ID
```

`gcloud secrets delete` prompts for confirmation. Confirm interactively; do
**not** pass `--quiet` — the prompt is the last human checkpoint that the
right project is targeted.

### Post-delete verification

```bash
gcloud secrets list --project="$PROJECT_ID" --filter='name~CRON_SECRET'
# Expected: empty output (no header row when nothing matches).
```

```powershell
gcloud secrets list --project=$env:PROJECT_ID --filter='name~CRON_SECRET'
```

Optionally re-run the production audit to confirm the whole posture is still
clean:

```bash
bun run gcp:audit-production-iap
```

---

## 2. `calendar-sync@` service account

### Background

The `calendar-sync@myrrh-rental-space.iam.gserviceaccount.com` service account
was created during an earlier Google Calendar OAuth design that has since been
retired. Two-way
Google Calendar sync now runs from the Cloud Scheduler cron
`/api/cron/calendar-sync`, which is invoked by
`myrrh-rental-space-scheduler@…` with an OIDC token — not by the
`calendar-sync@` SA. The bootstrap script
(`scripts/bootstrap-terraform.sh`) provisions only `runtime`, `build`,
`scheduler`, and `terraform-runner` SAs; `calendar-sync@` is not in that set.

The account therefore holds no repository-referenced role, no impersonation
grant, and no active credential. The cron job of the same name is a
`/api/cron/*` path, not this SA — they only share the string `calendar-sync`.

### Pre-delete verification (in-repo, 0 hits expected)

The literal service-account email must not appear anywhere in tracked
sources:

```bash
# 実 config だけを見る。`terraform/README.md` と `docs/gcp-production-setup.md` は
# 本 runbook へのリンクとして SA 名を書いているので、散文を含めると必ず当たる。
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!**/*.md' 'calendar-sync@'

# Explicit sub-scope confirmations (all must be empty):
rg 'calendar-sync@' src/
rg 'calendar-sync@' terraform/ --glob '!**/*.md'
rg 'calendar-sync@' scripts/
rg 'calendar-sync@' cloudbuild.yaml
```

```powershell
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' 'calendar-sync@'

rg 'calendar-sync@' src/
rg 'calendar-sync@' terraform/
rg 'calendar-sync@' scripts/
rg 'calendar-sync@' cloudbuild.yaml
```

Note: `calendar-sync` (without the `@`) still appears in the codebase — it
is the cron job name and the domain-code directory (see
`terraform/cloud_scheduler.tf`, `src/shared/lib/calendar-sync/**`,
`src/app/api/cron/calendar-sync/`). Only the string `calendar-sync@` is a
proxy for "the SA email is referenced." Any hit here blocks deletion.

### Pre-delete verification (GCP-side, no live bindings)

Confirm no principal impersonates the SA and no resource-scoped IAM binding
lists it:

```bash
CALENDAR_SYNC_SA="calendar-sync@${PROJECT_ID}.iam.gserviceaccount.com"
TMP=$(mktemp)

# SA-scoped IAM policy: no members should exist except default managed bindings.
gcloud iam service-accounts get-iam-policy "$CALENDAR_SYNC_SA" \
  --project="$PROJECT_ID"

# Project-level IAM policy: the SA must not appear as any role member.
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --format='value(bindings.role,bindings.members)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F "$CALENDAR_SYNC_SA" "$TMP" && { echo "STILL REFERENCED — do not delete"; exit 1; }
echo "clean"

# Cloud Scheduler jobs: none should invoke Cloud Run as calendar-sync@.
gcloud scheduler jobs list --project="$PROJECT_ID" --location=asia-northeast1 \
  --format='value(name,httpTarget.oidcToken.serviceAccountEmail)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F "$CALENDAR_SYNC_SA" "$TMP" && { echo "STILL REFERENCED — do not delete"; exit 1; }
echo "clean"
```

```powershell
$CALENDAR_SYNC_SA = "calendar-sync@${env:PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts get-iam-policy $CALENDAR_SYNC_SA `
  --project=$env:PROJECT_ID

gcloud projects get-iam-policy $env:PROJECT_ID `
  --flatten="bindings[].members" `
  --format='value(bindings.role,bindings.members)' `
  | Select-String -SimpleMatch $CALENDAR_SYNC_SA

gcloud scheduler jobs list --project=$env:PROJECT_ID --location=asia-northeast1 `
  --format='value(name,httpTarget.oidcToken.serviceAccountEmail)' `
  | Select-String -SimpleMatch $CALENDAR_SYNC_SA
```

The project-level and scheduler grep-style commands must print `clean`
(bash) or emit nothing (PowerShell). The SA-scoped policy is expected to
show only the auto-managed bindings; specifically, no
`roles/iam.serviceAccountTokenCreator` or `roles/iam.serviceAccountUser`
member should be listed. If a real binding is found, stop and revoke it
before deleting the SA — deletion does not implicitly revoke inherited
grants elsewhere.

### Delete

```bash
gcloud iam service-accounts delete \
  "calendar-sync@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$PROJECT_ID"
```

```powershell
gcloud iam service-accounts delete `
  "calendar-sync@${env:PROJECT_ID}.iam.gserviceaccount.com" `
  --project=$env:PROJECT_ID
```

Confirm interactively. Deletion is soft for 30 days: the SA disappears from
`gcloud iam service-accounts list` (it does **not** show as
`state=DISABLED`), and it can be undeleted with
`gcloud iam service-accounts undelete <UNIQUE_ID>` during that window.
After 30 days the delete becomes permanent.

**削除前に numeric unique ID を控えること。** 削除後に ID を引く手段が無い
（`gcloud iam service-accounts list` に `--show-deleted` フラグは存在しない）。

```bash
gcloud iam service-accounts describe "$CALENDAR_SYNC_SA"   --project="$PROJECT_ID" --format='value(uniqueId)'
```

### Post-delete verification

```bash
gcloud iam service-accounts list \
  --project="$PROJECT_ID" \
  --filter='email~calendar-sync'
# Expected: empty output.
```

```powershell
gcloud iam service-accounts list `
  --project=$env:PROJECT_ID `
  --filter='email~calendar-sync'
```

Optionally re-run the production audit for one more end-to-end signal:

```bash
bun run gcp:audit-production-iap
```

---

## 3. `RESEND_WEBHOOK_SECRET` (Secret Manager)

### Background

Resend webhook signature verification used to read
`RESEND_WEBHOOK_SECRET` from Secret Manager via Cloud Run. That secret
moved to Tier 2: the production canonical is the encrypted Settings DB
column `SettingsResend.resendWebhookSecret`, edited from
`/admin/settings/integrations`. Terraform already dropped state ownership
(`moved` + `removed { destroy = false }` in `terraform/secrets.tf`) and
does not list the name in `runtime_secrets` / `imported_secrets` /
`cloud_run_secret_versions`. Apply will **not** recreate the container
after this delete.

The env name `RESEND_WEBHOOK_SECRET` is still a **local-dev fallback**
(`src/shared/lib/env/server.ts`, `getResendWebhookSecret()`). Do **not**
delete that fallback, `.env.example`, or the DB column as part of this
cleanup. Secret Manager delete ≠ env-name delete.

Do **not** confuse this container with:

- `RESEND_API_KEY` — send API key (separate secret / DB field)
- `SUPPRESSION_HASH_SECRET` — live Cloud Run secret; **do not delete**
- DB `resendWebhookSecret` — production webhook signing secret

### Pre-delete verification (in-repo)

Hits in application code, tests, `.env.example`, Terraform comments, and
this runbook are expected. They document the local-dev fallback and the
already-applied TF forget. A hit that **binds Cloud Run or Cloud Build
to the Secret Manager container** blocks deletion.

```bash
# Inventory (expected: docs / comments / local-dev fallback / tests / TF forget).
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' RESEND_WEBHOOK_SECRET

# Must be empty — Cloud Build must not bind the SM container:
rg RESEND_WEBHOOK_SECRET cloudbuild.yaml

# Terraform config (prose .md excluded). Expected: comments + `moved` /
# `removed { destroy = false }` in terraform/secrets.tf, and a "do not
# add back" comment in terraform/variables.tf.
# A quoted list entry (`"RESEND_WEBHOOK_SECRET"` as its own line) or a
# `RESEND_WEBHOOK_SECRET = "<version>"` pin means TF would recreate or
# re-bind the container — STOP.
rg RESEND_WEBHOOK_SECRET terraform/ --glob '!**/*.md'
```

```powershell
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' RESEND_WEBHOOK_SECRET

rg RESEND_WEBHOOK_SECRET cloudbuild.yaml

rg RESEND_WEBHOOK_SECRET terraform/ --glob '!**/*.md'
```

The Cloud Run map / TF-forget contract is also gated by
`__tests__/unit/architecture/deploy-packaging-contract.test.ts`. If that
test is green on the revision you are about to operate on, the in-repo
binding side is already proven.

### Pre-delete verification (Cloud Run runtime env, 0 bindings expected)

`|| echo "clean"` は使わない — `gcloud` 自体が失敗しても出力が空になり、
`grep` が空振りして `clean` が出る（fail-open）。終了コードを明示的に見る。

```bash
TMP=$(mktemp)

gcloud run services describe myrrh-rental-space \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F RESEND_WEBHOOK_SECRET "$TMP" && { echo "STILL BOUND — do not delete"; exit 1; }
echo "clean"

gcloud run services describe myrrh-rental-space-admin \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  > "$TMP" || { echo "gcloud describe failed — do not delete"; exit 1; }
grep -F RESEND_WEBHOOK_SECRET "$TMP" && { echo "STILL BOUND — do not delete"; exit 1; }
echo "clean"
```

Both invocations must print `clean`.

### Pre-delete verification (production webhook still uses DB)

The live webhook must already authenticate with the Settings DB secret.
If it does not, deleting Secret Manager would not break production
(Cloud Run is unbound) but it would remove the last leftover copy of a
value you might still need to migrate.

1. Open `/admin/settings/integrations` (Resend tab) and confirm
   「Webhook 署名秘密」is set.
2. In the Resend Dashboard, redeliver a recent webhook event to
   `/api/webhooks/resend`. The response must be **200**, not **503**
   (503 means `getResendWebhookSecret()` found neither DB nor env).

Do not delete until both checks pass.

### Delete

```bash
gcloud secrets delete RESEND_WEBHOOK_SECRET --project="$PROJECT_ID"
```

```powershell
gcloud secrets delete RESEND_WEBHOOK_SECRET --project=$env:PROJECT_ID
```

`gcloud secrets delete` prompts for confirmation. Confirm interactively;
do **not** pass `--quiet` — the prompt is the last human checkpoint that
the right project and the right secret name are targeted.

### Post-delete verification

```bash
gcloud secrets list --project="$PROJECT_ID" --filter='name~RESEND_WEBHOOK_SECRET'
# Expected: empty output (no header row when nothing matches).
```

```powershell
gcloud secrets list --project=$env:PROJECT_ID --filter='name~RESEND_WEBHOOK_SECRET'
```

Re-run a Resend Dashboard event redelivery to `/api/webhooks/resend`.
It must still return 200.

Optionally re-run the production audit:

```bash
bun run gcp:audit-production-iap
```

After this delete lands, a follow-up PR drops the `moved` / `removed`
blocks in `terraform/secrets.tf` (Terraform's recommended cleanup once
the forget apply has succeeded). **Done 2026-08-22** — scaffolding removed;
`deploy-packaging-contract` asserts the blocks stay absent.

---

## Rollback

- **`CRON_SECRET`**: if the delete turns out to have been premature, recreate
  the secret container with `gcloud secrets create CRON_SECRET
--project="$PROJECT_ID" --replication-policy=automatic`. Do **not** restore
  a value blindly — the pre-delete audit above is the source of truth for
  "was this actually still in use," so the correct response is to find and
  fix the missed reader first, then recreate a fresh secret version at the
  reader's expected shape. The old ciphertext is not recoverable after
  destroy.
- **`calendar-sync@` SA**: within 30 days, recover with
  `gcloud iam service-accounts undelete <UNIQUE_ID> --project="$PROJECT_ID"`.
  The unique ID must have been captured **before** deleting (see the delete
  step) — `gcloud iam service-accounts list` has no `--show-deleted` flag, so
  after deletion the only remaining source is the Cloud Audit Log entry for
  the `DeleteServiceAccount` call. After 30 days,
  recreate with
  `gcloud iam service-accounts create calendar-sync
--project="$PROJECT_ID"` — the numeric unique ID will differ, so any
  historical audit logs that reference the old ID will not chain back to
  the new SA.
- **`RESEND_WEBHOOK_SECRET`**: the old ciphertext is not recoverable.
  Production does not read Secret Manager for this name — the Settings DB
  value is canonical — so recreation is usually unnecessary. If a missed
  reader still expected the Secret Manager container, fix that reader
  first, then `gcloud secrets create RESEND_WEBHOOK_SECRET
--project="$PROJECT_ID" --replication-policy=automatic` and add a fresh
  version. Do not put the name back into `runtime_secrets` /
  `cloud_run_secret_versions`.

## Related deferred cleanups (not this runbook's delete list)

| Resource                  | Status                                       | Next action                                                                                                                         |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SUPPRESSION_HASH_SECRET` | Phase C wired (Cloud Run + imported_secrets) | 対応なし。`validateProductionEnv` の fail-closed 化は merge 済み。`versions/1` を安易に rotate しないこと（ハッシュ空間が変わる） |

## Why the Claude harness cannot run the deletes

Both delete verbs (`secretmanager.secrets.delete`,
`iam.serviceAccounts.delete`) belong to the "Bootstrap-owns-all-project-IAM"
scope described in `terraform/README.md`. The workflow runner intentionally
holds neither `roles/secretmanager.admin` nor `roles/iam.serviceAccountAdmin`
(F1 structural closure removes both), so an automated `gcloud … delete`
issued through the deploy path would fail with `PERMISSION_DENIED`. That
is by design — resource destruction stays gated on a human project owner.
