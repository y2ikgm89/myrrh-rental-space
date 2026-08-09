# Encryption key rotation

`ENCRYPTION_KEY` (32-byte hex) is the master key behind `encrypt()` / `decrypt()`
in `src/shared/lib/crypto.ts`. Every ciphertext derives its own key from this
master plus a per-use `purpose` string, so one key protects two different kinds
of data:

- **Columns at rest** — the 12 integration secrets registered in
  `src/shared/lib/crypto-purposes.ts` plus
  `settings_instagram.instagram_access_token` (purpose `"instagram"`, declared at
  its call site in `src/shared/domain/instagram/commands.ts`).
- **Stateless tokens already handed out** — reservation / event-registration
  status, cancel, claim, complete, receipt-download, calendar-download,
  waitlist-offer, event-registration-payment and marketing-unsubscribe tokens.
  These live in **sent emails and URLs**, not in the database, so they cannot be
  re-encrypted. They are what sets the minimum length of the rotation window
  (see Step 6).

Losing the key corrupts every encrypted column. Rotating it without a dual-read
window breaks both kinds at once.

`SECONDARY_ENCRYPTION_KEYS` is a `kid:hex64` comma-separated env value consulted
**only during decrypt**, in addition to the primary
(`resolveEncryptionKeyByKid()` checks the primary kid first, then the secondary
list). It exists so we can rotate the primary key without stopping traffic:

1. Capture the currently-serving primary's material so it is not lost.
2. Publish the new primary alongside the old one.
3. Open the dual-read window with **both** kids.
4. Atomically cut over primary version AND primary kid via the same deploy.
5. Re-encrypt everything still carrying the old `kid`.
6. Close the window (empty the secondary list) once no old-kid ciphertext can
   still be presented.

Read `src/shared/lib/crypto.ts` and `src/shared/lib/env/encryption.ts` alongside
this file — they own the wire format (`v2:<kid>:<purpose>:...`) and the lookup
contract.

## Prerequisites

- Set `PROJECT_ID` before running anything below:

  ```bash
  export PROJECT_ID="myrrh-rental-space"
  ```

- Both Secret Manager secrets already exist and are Terraform-managed. Nothing
  needs creating:
  - `ENCRYPTION_KEY` — 64 hex characters
  - `SECONDARY_ENCRYPTION_KEYS` — steady state: empty string. Format
    `kid1:hex64,kid2:hex64`; `kid` is 1–32 chars of `[a-zA-Z0-9_-]`, duplicate
    kids inside the list are rejected.

  Both are declared in `terraform/secrets.tf` (`runtime_secrets` /
  `imported_secrets`) and pinned in `terraform/variables.tf`
  (`cloud_run_secret_versions`). Deploy Production (`workflow_dispatch`) →
  `terraform apply` makes a new Cloud Run revision reference the new version.

- Malformed values fail closed at **startup**, not at decrypt time:
  `validateProductionEnv()` calls `parseSecondaryEncryptionKeys()` and throws
  from `instrumentation.register()`, so the revision refuses to serve
  (`src/shared/lib/env/server.ts`, `src/instrumentation.ts`).

- `scripts/bootstrap-terraform.sh` is the SSoT for **all** project-level IAM
  bindings (2026-07-14 F1 refactor). Runtime-sa / build-sa hold project-level
  `roles/secretmanager.secretAccessor` (granted once by bootstrap, idempotent on
  re-run), so a secret added to the project is readable without any per-secret
  IAM step.

- Cloud Build itself has **no Secret Manager IAM management permission**. An
  earlier design (PR #1051–#1053) let Cloud Build reapply IAM automatically, but
  any role that includes `setIamPolicy` opens a self-grant path back to
  `secretAccessor`. The F1 refactor completed the closure: the runner holds
  neither `projectIamAdmin` nor `serviceAccountAdmin`, so it cannot self-grant,
  and both the Deny Policy (belt-and-suspenders, optional) and the custom
  `terraformRunnerSecretManagerNoPolicyMgmt` role come from
  `scripts/bootstrap-terraform.sh`.

## Rotation flow

**Naming**: call the current key `vN`, the new one `vN+1`. We are moving the
primary from `vN` to `vN+1` and letting the runtime decrypt both while the data
at rest catches up.

### Step 1 — capture the CURRENT primary (before touching anything)

The runtime pins `ENCRYPTION_KEY` at a fixed Secret Manager version. We need
that **specific** version's material for the secondary list — NOT `latest`,
because Step 2 publishes a new latest and `versions access latest` would then
return the new key. Publishing the new key into the secondary list under the OLD
kid label produces a window that decrypts nothing.

Both values are read out of Terraform by eye. There is no `terraform output` to
query — `terraform/` declares no output blocks, so any command of that shape
fails and, with a `|| echo 1` fallback, would silently hand you the wrong
version.

```bash
# terraform/variables.tf → cloud_run_secret_versions.ENCRYPTION_KEY
OLD_KEY_VERSION="1"
# terraform/variables.tf → variable "encryption_key_id" default
OLD_KID="v1"

OLD_KEY_HEX=$(gcloud secrets versions access "$OLD_KEY_VERSION" \
  --secret=ENCRYPTION_KEY \
  --project="$PROJECT_ID" | tr -d '\n')

# Length only proves it is a key, not that it is THE key. Confirm the version
# and kid against the running revision before continuing.
test "${#OLD_KEY_HEX}" -eq 64 || { echo "OLD_KEY_HEX is not 64 chars"; exit 1; }

gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 --project="$PROJECT_ID" \
  --format='value(spec.template.spec.containers[0].env)' | tr ',' '\n' \
  | grep -E 'ENCRYPTION_KEY(_ID)?'
```

Do not proceed until `OLD_KEY_HEX` is captured and both the version and the kid
match what the revision is actually serving. Every later step depends on this
being the exact key that produced the ciphertext already at rest.

### Step 2 — publish the new primary

```bash
NEW_KEY_HEX=$(openssl rand -hex 32)
printf '%s' "$NEW_KEY_HEX" | gcloud secrets versions add ENCRYPTION_KEY \
  --project="$PROJECT_ID" \
  --data-file=-
```

Record the returned version number as `NEW_KEY_VERSION`. Do NOT yet bump
`cloud_run_secret_versions.ENCRYPTION_KEY` — the runtime stays on the old
primary until Step 4 redeploys.

### Step 3 — open the dual-read window (both kids)

Publish **both** the old and the new key material:

```bash
NEW_KID="v2"   # vN+1

printf '%s:%s,%s:%s' "$OLD_KID" "$OLD_KEY_HEX" "$NEW_KID" "$NEW_KEY_HEX" \
  | gcloud secrets versions add SECONDARY_ENCRYPTION_KEYS \
    --project="$PROJECT_ID" \
    --data-file=-
```

Both entries are required. Step 4 rolls revisions out one at a time, so for a
few minutes some instances encrypt with `vN+1` while others are still on `vN`.
With only the old key in the list, an instance still on the old primary cannot
decrypt what a switched-over instance just wrote, and customers hit failures on
data written seconds earlier. Listing the incoming kid as well closes that gap
from both directions.

Having the current primary kid also appear in the secondary list is harmless —
`resolveEncryptionKeyByKid()` matches the primary first and never reaches the
duplicate. Only duplicates **inside** the list are rejected.

Note the returned version, bump
`cloud_run_secret_versions.SECONDARY_ENCRYPTION_KEYS` in
`terraform/variables.tf`, then run Deploy Production / `terraform apply`. The
primary kid is still `vN` at this point.

### Step 4 — cut over the primary

Bump the primary key version AND the primary kid identifier in the same deploy.
Both are Terraform-managed (`cloud_run_secret_versions.ENCRYPTION_KEY` and
`var.encryption_key_id` → `ENCRYPTION_KEY_ID` env), so a single apply flips them
atomically:

- `cloud_run_secret_versions.ENCRYPTION_KEY` → `NEW_KEY_VERSION`
- `encryption_key_id` variable → `v<N+1>`

⚠️ Do NOT set `ENCRYPTION_KEY_ID` via a one-off `gcloud run services update`.
Cloud Run's `--set-env-vars` is **destructive** (it replaces the full env-var
map rather than merging), and Terraform reapplies the full env map on every
deploy anyway. A mismatch between `ENCRYPTION_KEY_ID` and the pinned
`ENCRYPTION_KEY` version means the primary kid labels ciphertext with a key the
runtime is not actually deriving from — and the failure is silent until someone
tries to read the row back.

Keep `encryption_key_id` and the `ENCRYPTION_KEY` version pin in the same PR and
the same apply.

After this deploy, new encrypts use `v<N+1>` and `vN` ciphertext still resolves
through the secondary list.

### Step 5 — re-encrypt what is at rest

**There is no re-encryption tool.** No `bun run rotate-encryption-key`, no
per-domain repair action — searching for one wastes a rotation window. Rows keep
their original `kid` until something writes them again, so the sweep is manual:

| What                                                                                                                                                                            | How it gets re-encrypted                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The 12 settings columns in `src/shared/lib/crypto-purposes.ts` (Stripe, Resend, Turnstile, Google Maps, Google Calendar, Google Business Profile, SwitchBot ×3, webhook tokens) | Open each integration in the admin settings page, re-enter the value, save. The save path calls `encrypt()` with the new primary. |
| `settings_instagram.instagram_access_token`                                                                                                                                     | Re-run the Instagram OAuth connect flow from the admin settings page.                                                             |
| Stateless tokens in already-sent emails and URLs                                                                                                                                | Cannot be re-encrypted — they are not rows. Handled by the window in Step 6.                                                      |

Work through the table before closing the window. A column you forget stays
readable only while the old kid is in the secondary list.

### Step 6 — close the window

**Keep the window open for at least 90 days after Step 4.** The longest-lived
ciphertext this app hands out is not in the database: reservation status,
event-registration status and marketing-unsubscribe tokens all carry a 90-day
lifetime (`STATUS_TOKEN_LIFETIME_MS`,
`EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS`, `TOKEN_TTL_MS`). Removing the old
kid earlier turns every link already sitting in a customer's inbox into an
error. Shorter-lived ones (event-registration-payment: 7 days, and the cancel /
claim / receipt families) expire well inside that window.

Once the 90 days have passed and Step 5 is complete, empty the secondary list:

```bash
printf '' | gcloud secrets versions add SECONDARY_ENCRYPTION_KEYS \
  --project="$PROJECT_ID" \
  --data-file=-
```

Bump `cloud_run_secret_versions.SECONDARY_ENCRYPTION_KEYS` again and redeploy.
Destroy the old versions at your compliance retention boundary:

```bash
gcloud secrets versions destroy <old-version> --secret=ENCRYPTION_KEY \
  --project="$PROJECT_ID"
```

## Recovery

- **Step 4 failed halfway (primary version and/or kid already bumped).** Roll
  back **both** `cloud_run_secret_versions.ENCRYPTION_KEY` and
  `var.encryption_key_id` to their pre-rotation values in the same apply, then
  redeploy. Rolling back only the version leaves the kid pointing at a key the
  runtime no longer derives — the same silent mismatch Step 4 warns about. Leave
  `SECONDARY_ENCRYPTION_KEYS` alone: with both kids listed it decrypts whatever
  either side wrote during the partial rollout.
- **`SECONDARY_ENCRYPTION_KEYS` became malformed** (bad kid, wrong hex length,
  duplicate kid). `validateProductionEnv()` throws at
  `instrumentation.register()` and the revision refuses to serve. Fix the secret
  value and redeploy — no revision runs with a broken key list. Error messages
  deliberately report only entry index, kid and fragment length, so nothing
  usable leaks into Cloud Logging.

## What NOT to do

- Do not re-use a `kid` after retiring it. The wire-format `kid` selects the key
  for decryption; reusing `v1` for a fresh key makes historical `v1` ciphertext
  permanently unreadable.
- Do not put `SECONDARY_ENCRYPTION_KEYS` in a build arg or a plain env var — it
  must be a Secret Manager binding so it inherits access control and history.
- Do not skip Step 5 (re-encrypt). Closing the window with old ciphertext still
  in the database means the next revision, which no longer carries the secondary
  list, cannot decrypt those rows.
- Do not close the window early because Step 5 finished. Step 5 covers rows;
  the 90-day floor in Step 6 exists for the tokens that are not rows.
