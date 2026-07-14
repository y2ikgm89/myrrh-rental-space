# Dead GCP resource cleanup

Two Google Cloud resources are orphaned in `myrrh-rental-space` after upstream
migrations landed on `main` and never re-adopted them:

- **`CRON_SECRET` (Secret Manager)** — shared bearer token for `/api/cron/*`,
  dead since the Cloud Scheduler OIDC migration.
- **`calendar-sync@myrrh-rental-space.iam.gserviceaccount.com` (service
  account)** — impersonation identity for the retired Google Calendar OAuth
  integration.

Both resources exist only in GCP; the repository already has zero references
(gates enforced by `__tests__/unit/architecture/cron-oidc-clean-break.test.ts`
and `__tests__/unit/architecture/gcp-production-audit.test.ts`). Deleting
them is the last step to drop unused attack surface.

This runbook is a checklist for a **project owner running gcloud from their
own workstation**. The Claude harness does not hold the IAM roles required
to delete Secret Manager secrets or user-managed service accounts, so the
delete commands below must be executed by a human. The runbook documents the
pre-delete verification, the exact delete command, and the post-delete audit
so nothing else drifts.

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
# Any hit outside that set (src/**, cloudbuild.yaml, terraform/**, .env*, etc.) means
# the secret is still wired somewhere — STOP and re-audit before deleting.
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' CRON_SECRET

# Explicit "must not appear here" checks (any hit blocks deletion):
rg CRON_SECRET src/
rg CRON_SECRET cloudbuild.yaml
rg CRON_SECRET terraform/
```

```powershell
# PowerShell equivalent — same expected-hits rule as above.
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' CRON_SECRET

rg CRON_SECRET src/
rg CRON_SECRET cloudbuild.yaml
rg CRON_SECRET terraform/
```

If any hit lands outside the allowed set, stop. Either the OIDC migration
was reverted or a new code path adopted the legacy name — either way, do not
delete the secret until the reference is removed.

### Pre-delete verification (Cloud Run runtime env, 0 bindings expected)

```bash
gcloud run services describe myrrh-rental-space \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  | tr ',' '\n' | grep -F CRON_SECRET || echo "clean"

gcloud run services describe myrrh-rental-space-admin \
  --project="$PROJECT_ID" \
  --region=asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.name)' \
  | tr ',' '\n' | grep -F CRON_SECRET || echo "clean"
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
retired (see `project_ical-feed-removal-gcal-ssot-2026-06-24`). Two-way
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
# Full repository scan — must return NO matches.
rg --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' 'calendar-sync@'

# Explicit sub-scope confirmations (all must be empty):
rg 'calendar-sync@' src/
rg 'calendar-sync@' terraform/
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

# SA-scoped IAM policy: no members should exist except default managed bindings.
gcloud iam service-accounts get-iam-policy "$CALENDAR_SYNC_SA" \
  --project="$PROJECT_ID"

# Project-level IAM policy: the SA must not appear as any role member.
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --format='value(bindings.role,bindings.members)' \
  | grep -F "$CALENDAR_SYNC_SA" || echo "clean"

# Cloud Scheduler jobs: none should invoke Cloud Run as calendar-sync@.
gcloud scheduler jobs list --project="$PROJECT_ID" --location=asia-northeast1 \
  --format='value(name,httpTarget.oidcToken.serviceAccountEmail)' \
  | grep -F "$CALENDAR_SYNC_SA" || echo "clean"
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

Confirm interactively. Deletion is soft for 30 days — the SA moves to
`state=DISABLED` and can be undeleted with
`gcloud iam service-accounts undelete <UNIQUE_ID>` during that window.
After 30 days the delete becomes permanent.

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
  The unique ID is printed in the deletion output and is also visible in
  `gcloud iam service-accounts list --show-deleted`. After 30 days,
  recreate with
  `gcloud iam service-accounts create calendar-sync
--project="$PROJECT_ID"` — the numeric unique ID will differ, so any
  historical audit logs that reference the old ID will not chain back to
  the new SA.

## Why the Claude harness cannot run the deletes

Both delete verbs (`secretmanager.secrets.delete`,
`iam.serviceAccounts.delete`) belong to the "Bootstrap-owns-all-project-IAM"
scope described in `terraform/README.md`. The workflow runner intentionally
holds neither `roles/secretmanager.admin` nor `roles/iam.serviceAccountAdmin`
(F1 structural closure removes both), so an automated `gcloud … delete`
issued through the deploy path would fail with `PERMISSION_DENIED`. That
is by design — resource destruction stays gated on a human project owner.
