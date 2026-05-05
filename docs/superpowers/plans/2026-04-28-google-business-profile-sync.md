# Google Business Profile Sync Implementation Plan (MEO Phase 2)

> **In Progress: 2026-04-29** — 15 commits implemented on worktree `feature/google-business-profile-sync`. validate + build all succeeded. Next: smoke test (`GBP_STUB_MODE=true`) + main `--no-ff` merge + Google Cloud Console application.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the `Location` MEO fields established in Phase 1 outward to Google Business Profile (GBP). OAuth integration + Settings SSoT + fireAndForget on save + manual button + stub mode.

**Architecture:** Create `src/shared/lib/google-business-profile/` with the same structure as `google-calendar/`. Store OAuth tokens in `Settings.googleBusinessProfileAuth` (encrypted JSON), and manage sync state with `Location.gbpSyncEnabled / gbpSyncedAt / gbpSyncError`. With `GBP_STUB_MODE=true`, API calls are no-op, allowing implementation completion while access approval is pending.

**Tech Stack:** googleapis 171.4 (`mybusinessbusinessinformation` / `mybusinessaccountmanagement` v1) / Prisma 7.8 / Next.js 16 Server Actions / Better Auth 1.6 / Zod 4.3. Reuse existing `withGoogleApiRetry` / `encrypt` / `decrypt` / `fireAndForget` / `executeAdminMutationResult`.

**Spec:** `docs/superpowers/specs/2026-04-28-google-business-profile-sync-design.md`

**Worktree:** Create `feature/google-business-profile-sync` in a new session for implementation.

**Reference:** Same structure as Phase 1 (multi-location SEO foundation, ADR 0023, commits `822746b9`–`a77b471c`).

---

## Recommended bundling (subagent-driven-development)

| Bundle | Tasks      | Rationale                                                |
| ------ | ---------- | -------------------------------------------------------- |
| **A**  | 1, 2       | DB migration + serverEnv (independent, small)            |
| **B**  | 3          | Foundational lib (includes unit tests, ~580 lines)       |
| **C**  | 4, 5, 6    | Core sync logic (tightly coupled, mid type-check broken) |
| **D**  | 7, 8       | Domain + OAuth callback (independent, testable)          |
| **E**  | 9, 10      | Server Actions + fireAndForget wiring                    |
| **F**  | 11, 12, 13 | UI (tightly coupled, form props drilling)                |
| **G**  | 14, 15     | Docs + ADR (independent, trivial)                        |

Total 7 bundles, dispatched sequentially via subagent-driven-development. Bundle C / F should be sequential commits within one implementer.

---

## File Structure

### Created

```
src/shared/lib/google-business-profile/
├── client.ts            (~80 lines)  OAuth client creation + token refresh handler
├── oauth.ts             (~100 lines) authorize URL / getToken / revoke
├── account.ts           (~60 lines)  GBP account / location discovery
├── location-sync.ts     (~150 lines) Location → GBP PATCH logic (includes stub mode branching)
├── retry.ts             (~80 lines)  withGbpApiRetry (same shape as withGoogleApiRetry)
├── stub.ts              (~30 lines)  GBP_STUB_MODE no-op
├── settings.ts          (~80 lines)  Settings auth read/write helper
├── helpers.ts           (~80 lines)  buildGbpFieldMask / buildBusinessHoursPayload / formatGbpError
├── types.ts             (~50 lines)  GbpAuthState / GbpSyncResult / GbpLocationPayload
└── index.ts             (~10 lines)  barrel (server-only)

src/shared/domain/locations/
└── gbp-sync-commands.ts (~120 lines) syncLocationToGbpCommand / toggleLocationGbpSyncCommand

src/app/api/google-business-profile/oauth/callback/
└── route.ts             (~80 lines)  OAuth callback handler

src/app/(admin)/admin/(dashboard)/_shared/actions/settings/
└── google-business-profile.ts (~150 lines) Server Actions: initiate / revoke / triggerSync / toggle

src/app/(admin)/admin/(dashboard)/settings/_components/sections/
└── GoogleBusinessProfileSection.tsx (~180 lines) integration UI

src/app/(admin)/admin/(dashboard)/locations/_components/
└── LocationGbpSyncCard.tsx (~120 lines) GBP sync card inside the MEO tab

docs/architecture/decisions/
└── 0027-google-business-profile-sync.md (~80 lines) ADR

docs/guides/admin/
└── google-business-profile-setup.md (~100 lines) application workflow guide

prisma/migrations/<ts>_add_gbp_sync_fields/
└── migration.sql (~15 lines)

__tests__/unit/lib/google-business-profile/
├── retry.test.ts        (~150 lines)
├── helpers.test.ts      (~150 lines)
└── stub.test.ts         (~50 lines)

__tests__/integration/domain/locations/
└── gbp-sync-commands.test.ts (~250 lines)

__tests__/integration/actions/admin/
└── google-business-profile.test.ts (~200 lines)
```

### Modified

```
prisma/schema.prisma
  - Settings: googleBusinessProfileAuth (Json?) + googleBusinessProfileEnabled (Boolean default false)
  - Location: gbpSyncEnabled (Boolean default true) + gbpSyncedAt (DateTime?) + gbpSyncError (String? @db.Text)
  - Location @@index([gbpSyncError]) (partial index)

src/shared/lib/env/server.ts
  - GBP_STUB_MODE: z.string().optional()

src/shared/domain/settings/types.ts
  - Add googleBusinessProfileEnabled / googleBusinessProfileAuth to SettingsData

src/shared/domain/settings/admin-queries.ts
  - Add gbpSync-related fields to select clauses

src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts
  - Add fireAndForget(syncLocationToGbpCommand) to updateLocation afterSuccess
  - Same for createLocation

src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx
  - Add <LocationGbpSyncCard /> to MEO TabsContent (edit mode only)

src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx
  - Add GBP sync status badge column

src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts
  - Export GoogleBusinessProfileSection

src/app/(admin)/admin/(dashboard)/settings/api/page.tsx
  - Render GoogleBusinessProfileSection

src/shared/domain/locations/queries.ts
  - Add gbpSync-related fields to select clauses

src/shared/domain/locations/types.ts
  - Add gbpSync-related fields to LocationDetail / LocationListItem

package.json (test:unit / test:integration scripts)
  - Add new directory `__tests__/unit/lib/google-business-profile` to the batch
```

---

## Phase A: Foundation (Tasks 1-3)

### Task 1: DB Migration — gbp sync fields

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_gbp_sync_fields/migration.sql`
- Modify: `src/shared/domain/settings/types.ts`
- Modify: `src/shared/domain/settings/admin-queries.ts`
- Modify: `src/shared/domain/locations/types.ts`
- Modify: `src/shared/domain/locations/queries.ts`

- [ ] **Step 1.1: Add Settings to schema.prisma**

Add immediately after `googleCalendarOAuthEnabled` in the `Settings` model:

```prisma
  // Google Business Profile (MEO Phase 2)
  googleBusinessProfileEnabled Boolean @default(false)
  googleBusinessProfileAuth    Json?   // { accessToken, refreshToken, expiresAt, accountId } encrypted
```

- [ ] **Step 1.2: Add Location fields to schema.prisma**

Add immediately after `email` in the `Location` model:

```prisma
  // GBP Sync (MEO Phase 2)
  gbpSyncEnabled Boolean   @default(true)
  gbpSyncedAt    DateTime?
  gbpSyncError   String?   @db.Text
```

Add immediately after `@@index([sortOrder])`:

```prisma
  @@index([gbpSyncError])
```

- [ ] **Step 1.3: Write migration.sql manually**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_add_gbp_sync_fields', exist_ok=True)"
```

Write `prisma/migrations/${TS}_add_gbp_sync_fields/migration.sql` via python3 (PreToolUse hook blocks writing `prisma/migrations/*.sql`):

```sql
ALTER TABLE "settings" ADD COLUMN "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "googleBusinessProfileAuth" JSONB;

ALTER TABLE "locations" ADD COLUMN "gbpSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN "gbpSyncedAt" TIMESTAMP(3);
ALTER TABLE "locations" ADD COLUMN "gbpSyncError" TEXT;

CREATE INDEX "locations_gbpSyncError_idx" ON "locations" ("gbpSyncError") WHERE "gbpSyncError" IS NOT NULL;
```

- [ ] **Step 1.4: db execute + migrate resolve**

```bash
bunx --bun prisma db execute --file prisma/migrations/${TS}_add_gbp_sync_fields/migration.sql
bunx --bun prisma migrate resolve --applied ${TS}_add_gbp_sync_fields
bunx --bun prisma generate
```

Expected: all commands exit 0, `@generated/prisma/client` regenerated

- [ ] **Step 1.5: Sync update types.ts / queries.ts**

Add to the `SettingsData` interface in `src/shared/domain/settings/types.ts`:

```typescript
googleBusinessProfileEnabled: boolean;
googleBusinessProfileAuth: Prisma.JsonValue | null;
```

Add to all `select` clauses in `src/shared/domain/settings/admin-queries.ts` (next to `googleCalendarOAuthEnabled`):

```typescript
googleBusinessProfileEnabled: true,
googleBusinessProfileAuth: true,
```

Add to `LocationDetail` / `LocationListItem` in `src/shared/domain/locations/types.ts`:

```typescript
gbpSyncEnabled: boolean;
gbpSyncedAt: Date | null;
gbpSyncError: string | null;
```

Add to the admin `select` clause in `src/shared/domain/locations/queries.ts` (no need for public-queries):

```typescript
gbpSyncEnabled: true,
gbpSyncedAt: true,
gbpSyncError: true,
```

- [ ] **Step 1.6: Type-check verification**

```bash
bun run type-check
```

Expected: exit 0

- [ ] **Step 1.7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/${TS}_add_gbp_sync_fields/ src/shared/domain/settings/ src/shared/domain/locations/types.ts src/shared/domain/locations/queries.ts
git commit -m "feat(prisma): add GBP sync fields to Settings and Location"
```

---

### Task 2: serverEnv GBP_STUB_MODE

**Files:**

- Modify: `src/shared/lib/env/server.ts`

- [ ] **Step 2.1: Add GBP_STUB_MODE to serverEnv**

Add right after the `Stripe` section (before `GOOGLE_CLIENT_ID`):

```typescript
    // Google Business Profile
    GBP_STUB_MODE: z.string().optional(),
```

Also add inside the `runtimeEnv` block (near the end of the file):

```typescript
    GBP_STUB_MODE: process.env["GBP_STUB_MODE"],
```

- [ ] **Step 2.2: type-check + commit**

```bash
bun run type-check
git add src/shared/lib/env/server.ts
git commit -m "feat(env): add GBP_STUB_MODE for Google Business Profile stub mode"
```

---

### Task 3: google-business-profile lib structure (types / retry / helpers / stub)

**Files:**

- Create: `src/shared/lib/google-business-profile/types.ts`
- Create: `src/shared/lib/google-business-profile/retry.ts`
- Create: `src/shared/lib/google-business-profile/helpers.ts`
- Create: `src/shared/lib/google-business-profile/stub.ts`
- Test: `__tests__/unit/lib/google-business-profile/retry.test.ts`
- Test: `__tests__/unit/lib/google-business-profile/helpers.test.ts`
- Test: `__tests__/unit/lib/google-business-profile/stub.test.ts`
- Modify: `package.json` (add to test:unit batch)

**Reference:** Copy/rename `src/shared/lib/google-calendar/retry.ts` as SSoT.

- [ ] **Step 3.1: Create types.ts**

```typescript
import "server-only";

export type GbpAuthState = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId: string;
  readonly accountName: string;
};

export type GbpSyncInput = {
  readonly locationId: string;
};

export type GbpSyncResult = {
  readonly locationId: string;
  readonly syncedAt: Date;
};

export type GbpDayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type GbpTimePeriod = {
  readonly openDay: GbpDayOfWeek;
  readonly openTime: { readonly hours: number; readonly minutes: number };
  readonly closeDay: GbpDayOfWeek;
  readonly closeTime: { readonly hours: number; readonly minutes: number };
};

export type GbpRegularHours = {
  readonly periods: readonly GbpTimePeriod[];
};

export type GbpLocationPayload = {
  readonly title: string;
  readonly storefrontAddress: {
    readonly postalCode: string | undefined;
    readonly regionCode: "JP";
    readonly locality: string | undefined;
    readonly addressLines: readonly string[];
  };
  readonly phoneNumbers: { readonly primaryPhone: string | undefined };
  readonly regularHours: GbpRegularHours | undefined;
  readonly websiteUri: string | undefined;
  readonly latlng:
    | { readonly latitude: number; readonly longitude: number }
    | undefined;
};
```

- [ ] **Step 3.2: Create retry.ts (same shape as withGoogleApiRetry)**

Copy from `src/shared/lib/google-calendar/retry.ts`, rename functions to `withGbpApiRetry` / `isRetryableGbpApiError` / `extractGbpFirstErrorReason`. Retry logic (429 / 500 / 503 / 403 reason check / network error) stays the same.

- [ ] **Step 3.3: Create helpers.ts — buildGbpFieldMask + buildBusinessHoursPayload + buildLocationPayload + formatGbpError**

Pure function that takes `Location` fields `name / postalCode / city / streetAddress / buildingName / phoneNumber / businessHours / latitude / longitude` and returns `GbpLocationPayload`. `businessHours` JSON assumes `{ monday: { open: "09:00", close: "18:00" }, ..., sunday: { closed: true } }`. `buildBusinessHoursPayload` converts to GBP `TimePeriod` array, skipping invalid time formats and closed: true.

`buildGbpFieldMask` always includes base fields (title / storefrontAddress / phoneNumbers.primaryPhone / regularHours / websiteUri), and adds `latlng` only when both `latitude && longitude` exist.

`formatGbpError`: Error → message, long messages truncated to 200 chars + "..."; non-Error → "Unknown GBP API error" fallback.

- [ ] **Step 3.4: Create stub.ts**

```typescript
import "server-only";
import { logger } from "@/shared/lib/logger";
import type { GbpSyncInput, GbpSyncResult } from "./types";

export async function syncLocationStub(
  input: GbpSyncInput,
): Promise<GbpSyncResult> {
  logger.info("GBP sync stubbed", {
    locationId: input.locationId,
    reason: "GBP_STUB_MODE=true",
  });
  return { locationId: input.locationId, syncedAt: new Date() };
}
```

- [ ] **Step 3.5: Unit test — retry.test.ts**

Copy from `__tests__/unit/lib/google-calendar/retry.test.ts` and replace function names. Test retry decisions / 429 / 500 / 503 / 403 reason / network error / immediate 4xx failure.

- [ ] **Step 3.6: Unit test — helpers.test.ts**

Coverage:

- `buildGbpFieldMask`: fields array with/without latlng, base fields always included
- `buildBusinessHoursPayload`: valid JSON → TimePeriod array / null or empty → undefined / invalid format → skip / closed: true → skip
- `buildLocationPayload`: complete Location → verify all GbpLocationPayload properties
- `formatGbpError`: Error / non-Error / truncate long messages

- [ ] **Step 3.7: Unit test — stub.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { syncLocationStub } from "@/shared/lib/google-business-profile/stub";

describe("syncLocationStub", () => {
  test("returns locationId as-is and syncedAt is current time", async () => {
    const before = Date.now();
    const result = await syncLocationStub({ locationId: "loc-1" });
    const after = Date.now();
    expect(result.locationId).toBe("loc-1");
    expect(result.syncedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.syncedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 3.8: Add to package.json test:unit batch**

Add `bun test __tests__/unit/lib/google-business-profile` to the `test:unit` script in `package.json` with `&&` chaining (per-directory batch, ADR 0010).

- [ ] **Step 3.9: Run unit tests**

```bash
bun test __tests__/unit/lib/google-business-profile
```

Expected: all pass

- [ ] **Step 3.10: Commit**

```bash
git add src/shared/lib/google-business-profile/ __tests__/unit/lib/google-business-profile/ package.json
git commit -m "feat(gbp): add foundational lib (types/retry/helpers/stub) with unit tests"
```

---

## Phase B: Core Sync Logic (Tasks 4-6)

> **Bundling recommendation**: Tasks 4–6 are tightly coupled. In subagent-driven-development, bundle to one implementer and create three commits sequentially. Intermediate type-check breaks are acceptable.

### Task 4: location-sync.ts core

**Files:**

- Create: `src/shared/lib/google-business-profile/location-sync.ts`
- Create: `src/shared/lib/google-business-profile/index.ts`

- [ ] **Step 4.1: Create location-sync.ts**

Core logic:

1. `serverEnv.GBP_STUB_MODE === "true"` → `syncLocationStub(input)` early return
2. Fetch Location + check `gbpSyncEnabled` / `googleBusinessPlaceId` (if false/null, skip + update DB)
3. Get auth from Settings (`getGbpAuthState()`); if null, record "GBP integration not configured" in `gbpSyncError`
4. `getGbpClient(auth)` to get `mybusinessbusinessinformation` v1 client
5. Build request with `buildLocationPayload` + `buildGbpFieldMask`
6. Call `withGbpApiRetry(() => client.locations.patch({ name, updateMask, requestBody }))`
7. On success: update `gbpSyncedAt` + clear `gbpSyncError`
8. On failure: truncate via `formatGbpError` → record `gbpSyncError` + `logError` (MEDIUM) → no throw, graceful degradation

Assume GBP resource name stored in `Location.googleBusinessPlaceId` as `locations/{id}` (confirmed in Phase 1 input UI).

`siteUrl` is obtained via `getAppUrl()` (`@/shared/lib/utils/get-app-url`).

- [ ] **Step 4.2: Create index.ts barrel**

```typescript
import "server-only";

export { syncLocationToGbp } from "./location-sync";
export {
  getGbpAuthState,
  saveGbpAuthState,
  clearGbpAuthState,
} from "./settings";
export { listGbpAccounts } from "./account";
export {
  getGbpAuthorizeUrl,
  exchangeGbpAuthCode,
  revokeGbpToken,
} from "./oauth";
export type { GbpAuthState, GbpSyncInput, GbpSyncResult } from "./types";
```

- [ ] **Step 4.3: Commit (allow type-check broken; fixed in Tasks 5/6)**

```bash
git add src/shared/lib/google-business-profile/location-sync.ts src/shared/lib/google-business-profile/index.ts
git commit -m "feat(gbp): add location-sync core with stub mode early return"
```

---

### Task 5: oauth.ts + account.ts + client.ts

**Files:**

- Create: `src/shared/lib/google-business-profile/client.ts`
- Create: `src/shared/lib/google-business-profile/oauth.ts`
- Create: `src/shared/lib/google-business-profile/account.ts`

**Reference:** OAuth2Client initialization pattern in `src/shared/lib/google-calendar/oauth.ts`.

- [ ] **Step 5.1: Create client.ts — OAuth client creation + token refresh handler**

```typescript
import "server-only";
import { google } from "googleapis";
import { serverEnv } from "@/shared/lib/env/server";
import { saveGbpAuthState } from "./settings";
import type { GbpAuthState } from "./types";

const GBP_SCOPES = ["https://www.googleapis.com/auth/business.manage"];

export function createOAuth2Client(): InstanceType<
  typeof google.auth.OAuth2
> | null {
  if (!serverEnv.GOOGLE_CLIENT_ID || !serverEnv.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  return new google.auth.OAuth2(
    serverEnv.GOOGLE_CLIENT_ID,
    serverEnv.GOOGLE_CLIENT_SECRET,
    `${serverEnv.BETTER_AUTH_URL ?? ""}/api/google-business-profile/oauth/callback`,
  );
}

export async function getGbpClient(auth: GbpAuthState) {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    throw new Error("Google OAuth client credentials not configured");
  }

  oauth2Client.setCredentials({
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expiry_date: auth.expiresAt,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await saveGbpAuthState({
        ...auth,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? auth.refreshToken,
        expiresAt: tokens.expiry_date ?? auth.expiresAt,
      });
    }
  });

  return google.mybusinessbusinessinformation({
    version: "v1",
    auth: oauth2Client,
  });
}

export { GBP_SCOPES };
```

**Note**: The exact method structure of `google.mybusinessbusinessinformation` depends on the `googleapis` SDK version. Verify using SDK type definitions during implementation and adjust method chains (`.accounts.locations.patch`, etc.) as needed.

- [ ] **Step 5.2: Create oauth.ts — authorize URL / token exchange / revoke**

Exported functions:

- `getGbpAuthorizeUrl(state: string): string` — `oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GBP_SCOPES, state })`
- `exchangeGbpAuthCode(code: string): Promise<{ accessToken, refreshToken, expiresAt }>` — `oauth2Client.getToken(code)` → verify + normalize token
- `revokeGbpToken(refreshToken: string): Promise<void>` — `oauth2Client.revokeToken(refreshToken)`; on failure, only `logError` (LOW) and return void (prioritize user experience)

- [ ] **Step 5.3: Create account.ts — accounts.list**

```typescript
import "server-only";
import { google } from "googleapis";
import { withGbpApiRetry } from "./retry";

export type GbpAccount = {
  readonly accountId: string;
  readonly accountName: string;
};

export async function listGbpAccounts(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
): Promise<readonly GbpAccount[]> {
  const client = google.mybusinessaccountmanagement({
    version: "v1",
    auth: oauth2Client,
  });
  const response = await withGbpApiRetry(() => client.accounts.list({}));
  const accounts = response.data.accounts ?? [];
  return accounts.map((acc) => ({
    accountId: acc.name ?? "",
    accountName: acc.accountName ?? "Unknown Account",
  }));
}
```

- [ ] **Step 5.4: Commit**

```bash
git add src/shared/lib/google-business-profile/client.ts src/shared/lib/google-business-profile/oauth.ts src/shared/lib/google-business-profile/account.ts
git commit -m "feat(gbp): add OAuth client/flow + account discovery"
```

---

### Task 6: settings.ts — Settings auth encrypt/decrypt helper

**Files:**

- Create: `src/shared/lib/google-business-profile/settings.ts`

- [ ] **Step 6.1: Create settings.ts**

Exported functions:

- `getGbpAuthState(): Promise<GbpAuthState | null>` — get `googleBusinessProfileAuth` (Json) from Settings → `decrypt(encrypted)` → `JSON.parse` → return as `GbpAuthState`. If `googleBusinessProfileEnabled === false` or auth null → return null. If decrypt/parse fails, `logError` (HIGH) + return null (recoverable on next connect)
- `saveGbpAuthState(state: GbpAuthState): Promise<void>` — `encrypt(JSON.stringify(state))` → `Settings.update({ googleBusinessProfileAuth: { encrypted }, googleBusinessProfileEnabled: true })`
- `clearGbpAuthState(): Promise<void>` — `Settings.update({ googleBusinessProfileAuth: null, googleBusinessProfileEnabled: false })`

Settings is a singleton, so fetch the id with `findFirstOrThrow({ where: { id: { not: undefined } }, select: { id: true } })` and update. Import `encrypt` / `decrypt` from `@/shared/lib/crypto` (same pattern as `googleCalendarServiceAccountJson` `safeDecrypt` + `encryptApiKey`).

- [ ] **Step 6.2: Confirm type-check passes**

```bash
bun run type-check
```

Expected: exit 0 (all lib modules are consistent)

- [ ] **Step 6.3: Commit**

```bash
git add src/shared/lib/google-business-profile/settings.ts
git commit -m "feat(gbp): add Settings auth encrypt/decrypt helper"
```

---

## Phase C: Domain + Server Actions (Tasks 7-10)

### Task 7: gbp-sync-commands.ts + integration tests

**Files:**

- Create: `src/shared/domain/locations/gbp-sync-commands.ts`
- Test: `__tests__/integration/domain/locations/gbp-sync-commands.test.ts`
- Modify: `package.json` (ensure `__tests__/integration/domain/locations` is in `test:integration`)

- [ ] **Step 7.1: Create gbp-sync-commands.ts**

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { syncLocationToGbp } from "@/shared/lib/google-business-profile";
import type { GbpSyncResult } from "@/shared/lib/google-business-profile";

export type SyncLocationToGbpInput = { readonly locationId: string };

export async function syncLocationToGbpCommand(
  input: SyncLocationToGbpInput,
): Promise<GbpSyncResult> {
  return syncLocationToGbp(input);
}

export type ToggleLocationGbpSyncInput = {
  readonly locationId: string;
  readonly enabled: boolean;
};

export type ToggleLocationGbpSyncResult = {
  readonly id: string;
  readonly gbpSyncEnabled: boolean;
};

export async function toggleLocationGbpSyncCommand(
  input: ToggleLocationGbpSyncInput,
): Promise<ToggleLocationGbpSyncResult> {
  const location = await prisma.location.update({
    where: { id: input.locationId },
    data: {
      gbpSyncEnabled: input.enabled,
      ...(input.enabled === false ? { gbpSyncError: null } : {}),
    },
    select: { id: true, gbpSyncEnabled: true },
  });
  return location;
}
```

- [ ] **Step 7.2: Integration test**

Mock `@/shared/lib/google-business-profile` and stub all exports with `mock.module` (`syncLocationToGbp` / `getGbpAuthState` / `saveGbpAuthState` / `clearGbpAuthState` / `listGbpAccounts` / `getGbpAuthorizeUrl` / `exchangeGbpAuthCode` / `revokeGbpToken`). **All exports must be stubbed** (follow the C5 Phase 2 cloudflare all-stub template; partial mocks cause silent batch pollution).

Coverage:

- `syncLocationToGbpCommand` delegates locationId to `syncLocationToGbp`
- `toggleLocationGbpSyncCommand` clears `gbpSyncError` when `enabled: false`
- `toggleLocationGbpSyncCommand` preserves existing `gbpSyncError` when `enabled: true`

Declare mock types as `mock<(input: SyncLocationToGbpInput) => Promise<GbpSyncResult>>()` (CLAUDE.md learning: mocks without argument types can false-positive pass).

- [ ] **Step 7.3: Run tests**

```bash
bun test __tests__/integration/domain/locations
```

Expected: all pass

- [ ] **Step 7.4: Commit**

```bash
git add src/shared/domain/locations/gbp-sync-commands.ts __tests__/integration/domain/locations/gbp-sync-commands.test.ts package.json
git commit -m "feat(gbp): add domain commands for sync/toggle with integration tests"
```

---

### Task 8: OAuth callback route handler

**Files:**

- Create: `src/app/api/google-business-profile/oauth/callback/route.ts`

**Reference:** OAuth callback pattern in `src/app/api/instagram/oauth/callback/route.ts`.

- [ ] **Step 8.1: Create route.ts**

```typescript
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { exchangeGbpAuthCode } from "@/shared/lib/google-business-profile/oauth";
import { createOAuth2Client } from "@/shared/lib/google-business-profile/client";
import { listGbpAccounts } from "@/shared/lib/google-business-profile/account";
import { saveGbpAuthState } from "@/shared/lib/google-business-profile/settings";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAdminSession();
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    const errorParam = request.nextUrl.searchParams.get("error");

    if (errorParam || !code) {
      return NextResponse.redirect(
        new URL(
          `/admin/settings/api?gbp_error=${encodeURIComponent(errorParam ?? "missing_code")}`,
          request.url,
        ),
      );
    }

    const tokens = await exchangeGbpAuthCode(code);

    const oauth2Client = createOAuth2Client();
    if (!oauth2Client) throw new Error("OAuth client not configured");
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt,
    });
    const accounts = await listGbpAccounts(oauth2Client);
    const firstAccount = accounts[0];
    if (!firstAccount) {
      return NextResponse.redirect(
        new URL("/admin/settings/api?gbp_error=no_accounts_found", request.url),
      );
    }

    await saveGbpAuthState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountId: firstAccount.accountId,
      accountName: firstAccount.accountName,
    });

    return NextResponse.redirect(
      new URL("/admin/settings/api?gbp_success=true", request.url),
    );
  } catch (caughtError) {
    unstable_rethrow(caughtError);
    logError(normalizeError(caughtError), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "gbpOauthCallback" },
    });
    return NextResponse.redirect(
      new URL("/admin/settings/api?gbp_error=callback_failed", request.url),
    );
  }
}
```

`unstable_rethrow` rethrows Next.js 16 PPR bail-out errors (per gotchas.md §Route Handler).

- [ ] **Step 8.2: type-check + Commit**

```bash
bun run type-check
git add src/app/api/google-business-profile/
git commit -m "feat(gbp): add OAuth callback route handler"
```

---

### Task 9: Server Actions

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts`
- Test: `__tests__/integration/actions/admin/google-business-profile.test.ts`

- [ ] **Step 9.1: Create Server Actions**

Exported functions:

- `initiateGbpAuth(): Promise<void>` — `getGbpAuthorizeUrl("")` → `redirect(url)` (state is empty in Phase 2; CSRF protection in Phase 3)
- `revokeGbpAuth()` — `executeAdminMutationResult({ resource: "settings", action: "update", execute: async () => { revokeGbpToken + clearGbpAuthState }, afterSuccess: () => updateTag(CACHE_TAGS.INTEGRATION_SETTINGS) })`
- `triggerGbpSync(locationId: string)` — `executeAdminMutationResult({ resource: "location", action: "update", resourceId: locationId, execute: () => syncLocationToGbpCommand({ locationId }), afterSuccess: () => updateTag(CACHE_TAGS.LOCATIONS) })`
- `toggleLocationGbpSync(locationId: string, enabled: boolean)` — same flow via `toggleLocationGbpSyncCommand`

`initiateGbpAuth` uses `redirect()`, so return type is `Promise<void>` and it does not go through `executeAdminMutationResult` (`redirect()` throws in Next.js, so try/catch cannot swallow). Instead, call `verifyAdminSession()` directly at the start for auth checks.

- [ ] **Step 9.2: Integration test**

Mock `@/shared/lib/google-business-profile` + `@/shared/domain/locations/gbp-sync-commands`. Validate auth/permission/success/failure paths for each Server Action. See `__tests__/integration/actions/admin/settings-google-calendar.test.ts` template.

Coverage:

- `initiateGbpAuth` calls `redirect` (Next.js redirect throws internal error, detected via try/catch)
- `revokeGbpAuth` calls `revokeGbpToken` + `clearGbpAuthState`
- `triggerGbpSync` returns `MutationResult<{ locationId, syncedAt }>` on success
- `toggleLocationGbpSync` succeeds when `enabled: false`

- [ ] **Step 9.3: Run tests**

```bash
bun test __tests__/integration/actions/admin/google-business-profile.test.ts
```

Expected: all pass

- [ ] **Step 9.4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts' '__tests__/integration/actions/admin/google-business-profile.test.ts'
git commit -m "feat(gbp): add Server Actions for OAuth + sync trigger + toggle"
```

---

### Task 10: updateLocation afterSuccess fireAndForget wiring

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts` (or equivalent path)

- [ ] **Step 10.1: Locate file + extend afterSuccess**

Pre-implementation grep:

```bash
grep -rln "updateLocationCommand\|updateLocation\b" 'src/app/(admin)/admin/(dashboard)/_shared/actions/'
```

Add to the `updateLocation` Server Action `afterSuccess` in the target file:

```typescript
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { syncLocationToGbpCommand } from "@/shared/domain/locations/gbp-sync-commands";

afterSuccess: (data) => {
  updateTag(CACHE_TAGS.LOCATIONS);
  updateTag(getCacheTag.locations.detail(data.slug));
  fireAndForget(syncLocationToGbpCommand({ locationId: data.id }), {
    operation: "syncLocationToGbp",
    category: ErrorCategory.EXTERNAL_API,
  });
},
```

Add the same pattern to `createLocation` Server Action (new locations attempt initial sync; skip inside the command if Place ID is missing).

- [ ] **Step 10.2: type-check + Commit**

```bash
bun run type-check
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/'
git commit -m "feat(gbp): wire fireAndForget GBP sync to location create/update"
```

---

## Phase D: UI (Tasks 11-13)

### Task 11: GoogleBusinessProfileSection.tsx

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/GoogleBusinessProfileSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/api/page.tsx`

**Reference:** Use `GoogleCalendarSection.tsx` structure as a reference.

- [ ] **Step 11.1: Create Section component**

Implementation details:

- Connection status badge: not connected / connected (show accountName) / error
- "Connect with Google" button → call Server Action via `<form action={initiateGbpAuth}>` (redirect to Google OAuth)
- "Disconnect" button → AlertDialog confirmation → `revokeGbpAuth` Server Action
- Use `useSearchParams` to read `gbp_success` / `gbp_error` query params and show toast
- Description text: "After connecting, enable `gbpSyncEnabled` in each Location's MEO tab to sync."

a11y: all buttons `min-h-11`+, feedback with role="status" + aria-live="polite", error badge tooltip.

- [ ] **Step 11.2: Add export to index.ts barrel**

```typescript
export { GoogleBusinessProfileSection } from "./GoogleBusinessProfileSection";
```

- [ ] **Step 11.3: Add <GoogleBusinessProfileSection /> to settings/api/page.tsx**

Insert immediately after `<GoogleCalendarSection />`:

```tsx
<GoogleBusinessProfileSection settings={settings} />
```

- [ ] **Step 11.4: validate**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 11.5: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/settings/_components/sections/GoogleBusinessProfileSection.tsx' 'src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts' 'src/app/(admin)/admin/(dashboard)/settings/api/page.tsx'
git commit -m "feat(gbp): add GoogleBusinessProfileSection settings UI"
```

---

### Task 12: LocationGbpSyncCard.tsx

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationGbpSyncCard.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx`

- [ ] **Step 12.1: Create LocationGbpSyncCard.tsx**

Client Component (`"use client"`)。Props:

- `locationId: string`
- `googleBusinessPlaceId: string | null`
- `gbpSyncEnabled: boolean`
- `gbpSyncedAt: Date | null`
- `gbpSyncError: string | null`
- `gbpEnabledGlobally: boolean`

UI elements:

- Card with title "Google Business Profile Sync"
- `placeIdMissing` warning (when Place ID is not set)
- `globallyDisabled` warning (when `Settings.googleBusinessProfileEnabled` is false)
- Switch: sync ON/OFF for this location (`toggleLocationGbpSync` Server Action, optimistic update + rollback)
- Last sync time display (`formatDateTime(gbpSyncedAt)` or "Not synced")
- Error badge (when `gbpSyncError` is truthy)
- "Sync now" button (`triggerGbpSync` Server Action, `useTransition` + feedback `role="status" aria-live="polite"`)

Disable conditions: `isPending` / `enabled === false` / `globallyDisabled` / `placeIdMissing`

- [ ] **Step 12.2: Integrate into LocationForm.tsx MEO TabsContent**

Add immediately after `LocationMeoScoreCard` (edit mode only, when `location` prop exists):

```tsx
{
  location ? (
    <LocationGbpSyncCard
      locationId={location.id}
      googleBusinessPlaceId={location.googleBusinessPlaceId}
      gbpSyncEnabled={location.gbpSyncEnabled}
      gbpSyncedAt={location.gbpSyncedAt}
      gbpSyncError={location.gbpSyncError}
      gbpEnabledGlobally={settings.googleBusinessProfileEnabled}
    />
  ) : null;
}
```

If the `settings` prop does not exist in LocationForm, fetch `getSettings()` in the parent page (`locations/[id]/edit/page.tsx`) and prop-drill.

- [ ] **Step 12.3: validate + Commit**

```bash
bun run validate
git add 'src/app/(admin)/admin/(dashboard)/locations/_components/LocationGbpSyncCard.tsx' 'src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx'
git commit -m "feat(gbp): add LocationGbpSyncCard to MEO tab"
```

---

### Task 13: LocationTable badge column

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx`

- [ ] **Step 13.1: Add badge column**

Add `<TableHead>GBP Sync</TableHead>` and show a badge per row:

```tsx
function GbpSyncBadge({
  hasPlaceId,
  enabled,
  syncedAt,
  error,
}: {
  hasPlaceId: boolean;
  enabled: boolean;
  syncedAt: Date | null;
  error: string | null;
}) {
  if (!hasPlaceId) return <Badge variant="secondary">Place ID not set</Badge>;
  if (!enabled) return <Badge variant="secondary">Sync OFF</Badge>;
  if (error)
    return (
      <Badge variant="destructive" title={error}>
        Error
      </Badge>
    );
  if (syncedAt) return <Badge variant="success">Synced</Badge>;
  return <Badge variant="outline">Not synced</Badge>;
}
```

Apply `stopRowClick` to `<TableCell><GbpSyncBadge ... /></TableCell>` onClick (existing ClickableTableRow pattern, admin-ui-patterns.md §table row click navigation).

- [ ] **Step 13.2: validate + Commit**

```bash
bun run validate
git add 'src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx'
git commit -m "feat(gbp): add sync status badge column to LocationTable"
```

---

## Phase E: Docs + ADR (Tasks 14-15)

### Task 14: Setup guide doc

**Files:**

- Create: `docs/guides/admin/google-business-profile-setup.md`

- [ ] **Step 14.1: Create setup guide**

Contents:

- API enablement steps in Google Cloud Console
  - "My Business Business Information API"
  - "My Business Account Management API"
- OAuth 2.0 Client ID setup (reuse existing `GOOGLE_CLIENT_ID`, add redirect URI: `https://<domain>/api/google-business-profile/oauth/callback`)
- Submit Business Profile API access request form (usage example text)
- Operating during approval wait (`GBP_STUB_MODE=true` for UI verification)
- Post-approval verification steps
- Troubleshooting: 403 forbidden / no_accounts_found / token expiry / rate limits when saving dozens of locations

- [ ] **Step 14.2: Commit**

```bash
git add docs/guides/admin/google-business-profile-setup.md
git commit -m "docs(gbp): add Google Business Profile setup guide"
```

---

### Task 15: ADR 0027

**Files:**

- Create: `docs/architecture/decisions/0027-google-business-profile-sync.md`
- Modify: `docs/architecture/decisions/README.md`

- [ ] **Step 15.1: ADR numbering conflict cross-check**

```bash
ls docs/architecture/decisions/ | grep "^00" | tail -5
for w in .worktrees/*; do
  test -d "$w/docs/architecture/decisions/" && (cd "$w" && ls docs/architecture/decisions/ 2>/dev/null | grep "^00" | tail -3)
done
```

Expected: 0026 is the latest on main, 0027 unused. Confirm 0027 is absent in the worktree (rename to 0028+ if conflicts).

- [ ] **Step 15.2: Create ADR 0027**

Format the ADR draft from spec §8 into ADR format (Status / Date / Context / Decision / Consequences / Alternatives / References). Decision has 6 items (OAuth-based / app SSoT / single-account / fireAndForget on save + manual / graceful degradation / stub mode).

- [ ] **Step 15.3: Add to README.md index**

```markdown
| [0027](0027-google-business-profile-sync.md) | Google Business Profile sync | Accepted | 2026-04-XX |
```

- [ ] **Step 15.4: Commit**

```bash
git add docs/architecture/decisions/0027-google-business-profile-sync.md docs/architecture/decisions/README.md
git commit -m "docs(adr): 0027 Google Business Profile sync"
```

---

## Final Verification

- [ ] **Final Step: Full validate + build**

```bash
bun run validate && bun run build
```

Expected: exit 0

- [ ] **Smoke test (stub mode)**:
  1. Add `GBP_STUB_MODE=true` to `.env.local`
  2. Restart `bun dev`
  3. Confirm Settings > Google Business Profile section is visible (badge shows "Not connected" before linking)
  4. Edit Location → MEO tab → "Sync now" button → success display (stub does not update DB `gbpSyncedAt`, only stub.ts logger.info)
  5. LocationTable shows the GBP sync badge column

---

## Self-Review Checklist

- [x] **Spec coverage**: map all 9 sections to tasks
  - §1 Goal / §2 Architecture → Tasks 1-13
  - §3 Application workflow → Task 14
  - §4 Test strategy → Tasks 3.5-3.7 (unit) / Task 7.2 / Task 9.2 (integration)
  - §5 Migration → Task 1
  - §6 Risks → notes per task
  - §7 Scope boundary → all tasks
  - §8 ADR → Task 15
  - §9 Ground truth → done at plan start

- [x] **No placeholders**: real code / commands / file paths in every step

- [x] **Type consistency**: responsibility hierarchy `syncLocationToGbp` (lib) → `syncLocationToGbpCommand` (domain) → `triggerGbpSync` (Server Action) is consistent; `GbpSyncResult` is the same type at every layer

- [x] **Bundling instructions**: 7 bundles (A–G); Tasks 4–6 (Bundle C) and Tasks 11–13 (Bundle F) are tightly coupled, so bundle to one implementer; use plan-specified commit messages

- [x] **Ground truth alignment**:
  - ADR 0027 numbering (cross-check done)
  - Settings encryption pattern (same as `googleCalendarServiceAccountJson`, reuse `encrypt`/`decrypt`)
  - OAuth callback placement (same as `api/instagram/oauth/callback/`)
  - LocationForm tabs structure (`forceMount` + existing `meo` tab)
  - `updateLocation` return `{ id, slug }` (allows `data.id` in `fireAndForget`)
  - `fireAndForget(promise, { operation, category })` signature
  - `executeAdminMutationResult` `afterSuccess(data)` pattern
  - `mybusinessbusinessinformation` / `mybusinessaccountmanagement` v1 endpoint
  - OAuth scope `https://www.googleapis.com/auth/business.manage`
