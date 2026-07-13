# Encryption key rotation

`ENCRYPTION_KEY` (32-byte hex) is the master key for API keys, OAuth tokens,
Stripe payment data, guest-cancel tokens, and every other at-rest secret the
runtime keeps in the database. Losing it corrupts every encrypted column.
Rotating it without a dual-read window bricks the same columns.

`SECONDARY_ENCRYPTION_KEYS` is a `kid:hex64` comma-separated env value
consulted **only during decrypt**, in addition to the primary. It exists so we
can rotate the primary key without stopping traffic:

1. Capture the currently-serving primary's material so it is not lost.
2. Publish the new primary alongside the old one.
3. Open the dual-read window (old kid → secondary list).
4. Atomically cut over primary version AND primary kid via the same deploy.
5. Batch re-encrypt everything that still carries the old `kid`.
6. Close the window (empty the secondary list, verify no old-kid ciphertext
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
- Cloud Build's `grant-secret-access` step reapplies
  `roles/secretmanager.secretAccessor` to the runtime SA for every secret
  listed in that step (including `SECONDARY_ENCRYPTION_KEYS`) on each deploy.
  This is one-time bootstrapped by
  `bash scripts/setup-cloud-build-permissions.sh`, which creates a project
  custom role (`getIamPolicy` + `setIamPolicy` only, no value access) and
  grants it to Cloud Build's SA. The pre-defined `roles/secretmanager.admin`
  is intentionally NOT used — it would let a compromised build SA read or
  destroy every runtime secret in the project. Do not fall back to granting
  the accessor role by hand — the deploy pipeline is the SSoT and ad-hoc
  grants drift out of the SECRETS list.

If `SECONDARY_ENCRYPTION_KEYS` does not exist yet, create it once with an
empty payload before the first rotation. The Cloud Build deploy that follows
takes care of the IAM binding automatically:

```sh
printf '' | gcloud secrets create SECONDARY_ENCRYPTION_KEYS \
  --project="$PROJECT_ID" \
  --data-file=-
```

## Rotation flow

**Naming**: call the current key `vN`, the new one `vN+1`. We are moving the
primary from `vN` to `vN+1` and letting the runtime decrypt both while we
re-encrypt data at rest.

### Step 1 — capture the CURRENT primary (before touching anything)

The runtime pins `ENCRYPTION_KEY` at a fixed Secret Manager version via
`_ENCRYPTION_KEY_SECRET_VERSION` in `cloudbuild.yaml` (default `"1"`). We need
that **specific** version's material for the secondary list — NOT `latest`,
because Step 2 will publish a new latest and `versions access latest` would
then return the new key. Publishing the new key back into the secondary list
under the OLD kid label would produce a rotation window that decrypts nothing.

```sh
OLD_KEY_VERSION="$_ENCRYPTION_KEY_SECRET_VERSION"   # from cloudbuild.yaml or the deploy workflow substitution
OLD_KID="${ENCRYPTION_KEY_ID:-v1}"                  # whatever the running revision has

OLD_KEY_HEX=$(gcloud secrets versions access "$OLD_KEY_VERSION" \
  --secret=ENCRYPTION_KEY \
  --project="$PROJECT_ID" | tr -d '\n')

# Sanity check before continuing — this MUST be the key currently serving
# traffic. If length is not 64 or the value is empty, stop.
test "${#OLD_KEY_HEX}" -eq 64 || { echo "OLD_KEY_HEX is not 64 chars"; exit 1; }
```

Do not proceed until `OLD_KEY_HEX` is captured and verified. Every later step
depends on this being the exact key that produced the ciphertext already at
rest.

### Step 2 — publish the new primary

```sh
NEW_KEY_HEX=$(openssl rand -hex 32)
printf '%s' "$NEW_KEY_HEX" | gcloud secrets versions add ENCRYPTION_KEY \
  --project="$PROJECT_ID" \
  --data-file=-
```

Record the returned version number as `NEW_KEY_VERSION`. Do NOT yet bump
`_ENCRYPTION_KEY_SECRET_VERSION` — the runtime is still on the old primary
until Step 4 redeploys.

### Step 3 — open the dual-read window

Publish the OLD primary hex (captured in Step 1) into
`SECONDARY_ENCRYPTION_KEYS`:

```sh
printf '%s:%s' "$OLD_KID" "$OLD_KEY_HEX" \
  | gcloud secrets versions add SECONDARY_ENCRYPTION_KEYS \
    --project="$PROJECT_ID" \
    --data-file=-
```

Note the returned version. Submit a Cloud Build deploy that bumps
`_SECONDARY_ENCRYPTION_KEYS_SECRET_VERSION` to the new version. After the
revision serves, every decrypt still finds the old kid via the secondary
list. The primary kid is still `vN` at this point.

### Step 4 — cut over the primary

Bump the primary key version AND the primary kid identifier in the same Cloud
Build deploy. Both are Cloud Build substitutions plumbed through
`cloudbuild.yaml` into the Cloud Run `--set-env-vars` and `--set-secrets`
lists, so a single deploy flips them atomically:

- `_ENCRYPTION_KEY_SECRET_VERSION` → `NEW_KEY_VERSION`
- `_ENCRYPTION_KEY_ID` → `v<N+1>`

⚠️ Do NOT set `ENCRYPTION_KEY_ID` via a one-off `gcloud run services update`.
Cloud Run's `--set-env-vars` is **destructive** (it replaces the full env-var
map, not merge), and `cloudbuild.yaml` reapplies the full `--set-env-vars`
line on every deploy. A mismatch between `ENCRYPTION_KEY_ID` and
`_ENCRYPTION_KEY_SECRET_VERSION` means the primary kid points at a different
key than the runtime is deriving from — decrypt of old data breaks silently
because the runtime looks up `parsed.kid` against the WRONG kid label first.

Route `ENCRYPTION_KEY_ID` through `_ENCRYPTION_KEY_ID` so the two always
change together.

At this point new encrypts use `v<N+1>`, decrypts of `vN` ciphertext resolve
via the secondary list.

### Step 5 — batch re-encrypt

Run the domain-specific re-encryption sweep for every encrypted column. Each
callsite is already using `encrypt()` / `decrypt()` from
`src/shared/lib/crypto.ts`, so the pattern is `decrypt` (finds `vN` via
secondary) → `encrypt` (writes `v<N+1>` because that is the new primary).

At the time of writing there is no bundled `bun run rotate-encryption-key`
CLI — the sweep is per-domain by design. Reservations, `ApiKey` rows, Stripe
integration secrets, OAuth tokens, and Google Calendar credentials each have
their own admin action / repair path. See the individual domain modules
under `src/shared/domain/` and prefer running the existing repair action on
a schedule until every row's stored `kid` is `v<N+1>`.

### Step 6 — close the window

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
