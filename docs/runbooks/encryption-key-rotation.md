# Encryption key rotation

`ENCRYPTION_KEY` (32-byte hex) is the master key for API keys, OAuth tokens,
Stripe payment data, guest-cancel tokens, and every other at-rest secret the
runtime keeps in the database. Losing it corrupts every encrypted column.
Rotating it without a dual-read window bricks the same columns.

`SECONDARY_ENCRYPTION_KEYS` is a `kid:hex64` comma-separated env value
consulted **only during decrypt**, in addition to the primary. It exists so we
can rotate the primary key without stopping traffic:

1. Publish the new primary.
2. Keep the old primary in the secondary list.
3. Batch re-encrypt everything that still carries the old `kid`.
4. Close the window (empty the secondary list, verify no old-kid ciphertext
   remains).

Read `src/shared/lib/crypto.ts` and
`src/shared/lib/env/encryption.ts` alongside this file — they own the wire
format (`v2:<kid>:<purpose>:...`) and the lookup contract.

## Prerequisites

- Both Secret Manager secrets exist in the project:
  - `ENCRYPTION_KEY` — 64 hex characters
  - `SECONDARY_ENCRYPTION_KEYS` — Steady state: empty string. Format:
    `kid1:hex64,kid2:hex64`. `getSecondaryEncryptionKeys()` throws if the
    format is invalid, so we fail closed at startup rather than at decrypt.
- `cloudbuild.yaml` binds `SECONDARY_ENCRYPTION_KEYS` at the version pinned by
  `_SECONDARY_ENCRYPTION_KEYS_SECRET_VERSION` (default `"1"`).

If `SECONDARY_ENCRYPTION_KEYS` does not exist yet, create it once with an
empty payload before the first rotation:

```sh
printf '' | gcloud secrets create SECONDARY_ENCRYPTION_KEYS \
  --project="$PROJECT_ID" \
  --data-file=-
gcloud secrets add-iam-policy-binding SECONDARY_ENCRYPTION_KEYS \
  --project="$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor"
```

## Rotation flow

**Naming**: call the current key `vN`, the new one `vN+1`. We are moving the
primary from `vN` to `vN+1` and letting the runtime decrypt both while we
re-encrypt data at rest.

### Step 1 — publish the new primary

```sh
NEW_KEY_HEX=$(openssl rand -hex 32)
printf '%s' "$NEW_KEY_HEX" | gcloud secrets versions add ENCRYPTION_KEY \
  --project="$PROJECT_ID" \
  --data-file=-
```

Record the returned version number as `NEW_KEY_VERSION`. Do NOT yet bump
`_ENCRYPTION_KEY_SECRET_VERSION` — the runtime is still on the old primary.

Also fetch the CURRENT primary hex before Step 2 (we need it for the
secondary list):

```sh
OLD_KEY_HEX=$(gcloud secrets versions access latest \
  --secret=ENCRYPTION_KEY \
  --project="$PROJECT_ID" | tr -d '\n')
OLD_KID=${OLD_KID:-v1}  # whatever ENCRYPTION_KEY_ID currently is
```

### Step 2 — open the dual-read window

Publish the old primary into `SECONDARY_ENCRYPTION_KEYS`:

```sh
printf '%s:%s' "$OLD_KID" "$OLD_KEY_HEX" \
  | gcloud secrets versions add SECONDARY_ENCRYPTION_KEYS \
    --project="$PROJECT_ID" \
    --data-file=-
```

Note the returned version. Submit a Cloud Build deploy that bumps
`_SECONDARY_ENCRYPTION_KEYS_SECRET_VERSION` to the new version. After the
revision serves, every decrypt still finds the old kid via the secondary
list.

### Step 3 — cut over the primary

Bump the primary to the new version and the primary kid to `vN+1`:

- Update the Cloud Build substitutions or workflow so
  `_ENCRYPTION_KEY_SECRET_VERSION` points to `NEW_KEY_VERSION`.
- Set `ENCRYPTION_KEY_ID=v<N+1>` on the Cloud Run service (env var, not a
  secret).
- Deploy.

At this point new encrypts use `vN+1`, decrypts still resolve old `vN`
ciphertext via the secondary list.

### Step 4 — batch re-encrypt

Run the domain-specific re-encryption sweep for every encrypted column. Each
callsite is already using `encrypt()` / `decrypt()` from
`src/shared/lib/crypto.ts`, so the pattern is `decrypt` (finds `vN` via
secondary) → `encrypt` (writes `vN+1` because that is the new primary).

At the time of writing there is no bundled `bun run rotate-encryption-key`
CLI — the sweep is per-domain by design. Reservations, `ApiKey` rows, Stripe
integration secrets, OAuth tokens, and Google Calendar credentials each have
their own admin action / repair path. See the individual domain modules
under `src/shared/domain/` and prefer running the existing repair action on
a schedule until every row's stored `kid` is `vN+1`.

### Step 5 — close the window

When you have confidence that no `vN`-encrypted row remains (audit via a SQL
query against each encrypted column, or wait one full rotation of the
longest-lived token), empty the secondary list:

```sh
printf '' | gcloud secrets versions add SECONDARY_ENCRYPTION_KEYS \
  --project="$PROJECT_ID" \
  --data-file=-
```

Bump `_SECONDARY_ENCRYPTION_KEYS_SECRET_VERSION` again and redeploy. Destroy
the old versions of `ENCRYPTION_KEY` and `SECONDARY_ENCRYPTION_KEYS` at your
compliance retention boundary:

```sh
gcloud secrets versions destroy <old-version> --secret=ENCRYPTION_KEY \
  --project="$PROJECT_ID"
```

## Recovery

- If Step 3 fails halfway and the old primary is already retired: roll back
  the `_ENCRYPTION_KEY_SECRET_VERSION` substitution and redeploy. The
  secondary list still contains the pre-rotation key, so the previous
  revision decrypts everything.
- If `SECONDARY_ENCRYPTION_KEYS` accidentally becomes malformed (bad kid,
  wrong hex length), `validateProductionEnv()` throws at
  `instrumentation.register()` time and the revision refuses to serve. Fix
  the secret value and redeploy — no revision runs with a broken key list.

## What NOT to do

- Do not re-use a `kid` after retiring it. Wire-format `kid` selects the key
  for decryption; if you reuse `v1` for a fresh key you cannot decrypt the
  historical `v1` ciphertext ever again.
- Do not put `SECONDARY_ENCRYPTION_KEYS` in a build arg or a plain env var —
  it must be a Secret Manager binding so it inherits access control and
  history.
- Do not skip Step 4. Leaving old ciphertext in the database with a closed
  window means the next revision that omits the secondary list cannot
  decrypt those rows.
