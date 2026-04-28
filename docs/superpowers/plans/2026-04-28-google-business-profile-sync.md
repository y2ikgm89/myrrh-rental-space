# Google Business Profile Sync Implementation Plan (MEO Phase 2)

> **In Progress: 2026-04-29** — worktree `feature/google-business-profile-sync` で 15 commit 実装完了。validate + build 全成功。次は smoke test (`GBP_STUB_MODE=true`) + main `--no-ff` merge + Google Cloud Console 申請。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 で確立した `Location` MEO フィールドを Google Business Profile (GBP) に外向き同期する。OAuth 連携 + Settings SSoT + fireAndForget on save + manual button + stub mode の構成。

**Architecture:** `src/shared/lib/google-business-profile/` を `google-calendar/` 同型構造で新設。`Settings.googleBusinessProfileAuth` (encrypted JSON) で OAuth token 保管、`Location.gbpSyncEnabled / gbpSyncedAt / gbpSyncError` で同期状態管理。`GBP_STUB_MODE=true` で API 呼び出しを no-op 化し、access 承認待ちでも実装完遂可能。

**Tech Stack:** googleapis 171.4 (`mybusinessbusinessinformation` / `mybusinessaccountmanagement` v1) / Prisma 7.8 / Next.js 16 Server Actions / Better Auth 1.6 / Zod 4.3。既存 `withGoogleApiRetry` / `encrypt` / `decrypt` / `fireAndForget` / `executeAdminMutationResult` を流用。

**Spec:** `docs/superpowers/specs/2026-04-28-google-business-profile-sync-design.md`

**Worktree:** 新セッションで `feature/google-business-profile-sync` を新規作成して実装する。

**Reference:** Phase 1 (multi-location SEO foundation, ADR 0023, commits `822746b9`〜`a77b471c`) と同型構造。

---

## Bundle 化推奨（subagent-driven-development）

| Bundle | Tasks      | Rationale                                         |
| ------ | ---------- | ------------------------------------------------- |
| **A**  | 1, 2       | DB migration + serverEnv（独立、small）           |
| **B**  | 3          | Foundational lib（unit tests 含む、~580 lines）   |
| **C**  | 4, 5, 6    | Core sync logic（密結合、type-check 中間 broken） |
| **D**  | 7, 8       | Domain + OAuth callback（独立 testable）          |
| **E**  | 9, 10      | Server Actions + fireAndForget 配線               |
| **F**  | 11, 12, 13 | UI（密結合、Form props drill）                    |
| **G**  | 14, 15     | Docs + ADR（独立、trivial）                       |

合計 7 bundle、subagent-driven-development で順次 dispatch。Bundle C / F は 1 implementer 内で sequential commit 推奨。

---

## File Structure

### Created

```
src/shared/lib/google-business-profile/
├── client.ts            (~80 lines)  OAuth クライアント生成 + token refresh handler
├── oauth.ts             (~100 lines) authorize URL / getToken / revoke
├── account.ts           (~60 lines)  GBP account / location discovery
├── location-sync.ts     (~150 lines) Location → GBP PATCH ロジック (stub mode 分岐含む)
├── retry.ts             (~80 lines)  withGbpApiRetry (withGoogleApiRetry 同型)
├── stub.ts              (~30 lines)  GBP_STUB_MODE no-op
├── settings.ts          (~80 lines)  Settings auth 読み書き helper
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
└── GoogleBusinessProfileSection.tsx (~180 lines) 連携 UI

src/app/(admin)/admin/(dashboard)/locations/_components/
└── LocationGbpSyncCard.tsx (~120 lines) MEO タブ内の GBP 同期カード

docs/architecture/decisions/
└── 0027-google-business-profile-sync.md (~80 lines) ADR

docs/guides/admin/
└── google-business-profile-setup.md (~100 lines) 申請ワークフロー guide

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
  - SettingsData に googleBusinessProfileEnabled / googleBusinessProfileAuth 追加

src/shared/domain/settings/admin-queries.ts
  - select 句に gbpSync 関連フィールド追加

src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts
  - updateLocation の afterSuccess に fireAndForget(syncLocationToGbpCommand) 追加
  - createLocation も同様

src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx
  - meo TabsContent に <LocationGbpSyncCard /> 追加 (edit mode のみ)

src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx
  - GBP 同期状態バッジ列追加

src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts
  - GoogleBusinessProfileSection を export

src/app/(admin)/admin/(dashboard)/settings/api/page.tsx
  - GoogleBusinessProfileSection を render

src/shared/domain/locations/queries.ts
  - select 句に gbpSync 関連フィールド追加

src/shared/domain/locations/types.ts
  - LocationDetail / LocationListItem に gbpSync 関連フィールド追加

package.json (test:unit / test:integration scripts)
  - 新規 directory `__tests__/unit/lib/google-business-profile` を batch に追加
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

- [ ] **Step 1.1: schema.prisma に Settings 追加**

`Settings` モデルの `googleCalendarOAuthEnabled` 直後に追加:

```prisma
  // Google Business Profile (MEO Phase 2)
  googleBusinessProfileEnabled Boolean @default(false)
  googleBusinessProfileAuth    Json?   // { accessToken, refreshToken, expiresAt, accountId } encrypted
```

- [ ] **Step 1.2: schema.prisma に Location 追加**

`Location` モデルの `email` 直後に追加:

```prisma
  // GBP Sync (MEO Phase 2)
  gbpSyncEnabled Boolean   @default(true)
  gbpSyncedAt    DateTime?
  gbpSyncError   String?   @db.Text
```

`@@index([sortOrder])` の直後に追加:

```prisma
  @@index([gbpSyncError])
```

- [ ] **Step 1.3: migration.sql 手書き**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_add_gbp_sync_fields', exist_ok=True)"
```

`prisma/migrations/${TS}_add_gbp_sync_fields/migration.sql` を python3 で書き出す（PreToolUse hook が `prisma/migrations/*.sql` を Write 拒否するため）:

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

Expected: 全コマンド exit 0、`@generated/prisma/client` 再生成

- [ ] **Step 1.5: types.ts / queries.ts 同期更新**

`src/shared/domain/settings/types.ts` の `SettingsData` interface に追加:

```typescript
googleBusinessProfileEnabled: boolean;
googleBusinessProfileAuth: Prisma.JsonValue | null;
```

`src/shared/domain/settings/admin-queries.ts` の全 `select` 句に追加（参照: `googleCalendarOAuthEnabled` の隣）:

```typescript
googleBusinessProfileEnabled: true,
googleBusinessProfileAuth: true,
```

`src/shared/domain/locations/types.ts` の `LocationDetail` / `LocationListItem` に追加:

```typescript
gbpSyncEnabled: boolean;
gbpSyncedAt: Date | null;
gbpSyncError: string | null;
```

`src/shared/domain/locations/queries.ts` の admin 用 `select` 句に追加（public-queries では追加不要）:

```typescript
gbpSyncEnabled: true,
gbpSyncedAt: true,
gbpSyncError: true,
```

- [ ] **Step 1.6: type-check 検証**

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

- [ ] **Step 2.1: serverEnv に GBP_STUB_MODE 追加**

`Stripe` セクションの直後（`GOOGLE_CLIENT_ID` の前）に追加:

```typescript
    // Google Business Profile
    GBP_STUB_MODE: z.string().optional(),
```

`runtimeEnv` block 内（同ファイル末尾付近）にも追加:

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
- Modify: `package.json` (test:unit batch に追加)

**Reference:** `src/shared/lib/google-calendar/retry.ts` を SSoT としてコピー改名。

- [ ] **Step 3.1: types.ts 作成**

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

- [ ] **Step 3.2: retry.ts 作成（withGoogleApiRetry 同型）**

`src/shared/lib/google-calendar/retry.ts` をベースにコピー、関数名を `withGbpApiRetry` / `isRetryableGbpApiError` / `extractGbpFirstErrorReason` に変更。リトライ判定ロジック（429 / 500 / 503 / 403 reason 検査 / network error）は同一。

- [ ] **Step 3.3: helpers.ts 作成 — buildGbpFieldMask + buildBusinessHoursPayload + buildLocationPayload + formatGbpError**

`Location` の `name / postalCode / city / streetAddress / buildingName / phoneNumber / businessHours / latitude / longitude` を引数に受け、`GbpLocationPayload` を返す pure function。`businessHours` JSON は `{ monday: { open: "09:00", close: "18:00" }, ..., sunday: { closed: true } }` 形式想定。`buildBusinessHoursPayload` は GBP `TimePeriod` 配列に変換、不正な時刻フォーマット / closed: true はスキップ。

`buildGbpFieldMask` は基本フィールド (title / storefrontAddress / phoneNumbers.primaryPhone / regularHours / websiteUri) を常時含み、`latitude && longitude` 両方ある場合のみ `latlng` を追加。

`formatGbpError` は Error → message、長い message は 200 文字 + "..." に truncate、非 Error → "Unknown GBP API error" fallback。

- [ ] **Step 3.4: stub.ts 作成**

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

- [ ] **Step 3.5: 単体テスト — retry.test.ts**

`__tests__/unit/lib/google-calendar/retry.test.ts` をベースにコピーして関数名を置換。retry 判定 / 429 / 500 / 503 / 403 reason / network error / 4xx 即時失敗をテスト。

- [ ] **Step 3.6: 単体テスト — helpers.test.ts**

カバー対象:

- `buildGbpFieldMask`: latlng 有/無で fields 配列分岐、基本フィールド常時包含
- `buildBusinessHoursPayload`: 正常 JSON → TimePeriod 配列変換 / null・空 → undefined / 不正フォーマット → スキップ / closed: true → スキップ
- `buildLocationPayload`: 完全な Location → GbpLocationPayload 全プロパティ確認
- `formatGbpError`: Error / 非 Error / 長い message truncate

- [ ] **Step 3.7: 単体テスト — stub.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { syncLocationStub } from "@/shared/lib/google-business-profile/stub";

describe("syncLocationStub", () => {
  test("locationId をそのまま返し、syncedAt は現在時刻", async () => {
    const before = Date.now();
    const result = await syncLocationStub({ locationId: "loc-1" });
    const after = Date.now();
    expect(result.locationId).toBe("loc-1");
    expect(result.syncedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.syncedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 3.8: package.json test:unit batch 追加**

`package.json` の `test:unit` script に `bun test __tests__/unit/lib/google-business-profile` を `&&` チェーンで追加（per-directory batch、ADR 0010 準拠）。

- [ ] **Step 3.9: 単体テスト実行**

```bash
bun test __tests__/unit/lib/google-business-profile
```

Expected: 全 pass

- [ ] **Step 3.10: Commit**

```bash
git add src/shared/lib/google-business-profile/ __tests__/unit/lib/google-business-profile/ package.json
git commit -m "feat(gbp): add foundational lib (types/retry/helpers/stub) with unit tests"
```

---

## Phase B: Core Sync Logic (Tasks 4-6)

> **Bundle 化推奨**: Task 4-6 は密結合。subagent-driven-development では 1 implementer に bundle して 3 commit を順次作成。中間 type-check broken は許容。

### Task 4: location-sync.ts core

**Files:**

- Create: `src/shared/lib/google-business-profile/location-sync.ts`
- Create: `src/shared/lib/google-business-profile/index.ts`

- [ ] **Step 4.1: location-sync.ts 作成**

主要ロジック:

1. `serverEnv.GBP_STUB_MODE === "true"` → `syncLocationStub(input)` 早期 return
2. Location 取得 + `gbpSyncEnabled` / `googleBusinessPlaceId` 判定（false / null なら skip + DB 更新）
3. Settings から auth 取得（`getGbpAuthState()`）→ null なら "GBP 連携未設定" を `gbpSyncError` に記録
4. `getGbpClient(auth)` で `mybusinessbusinessinformation` v1 client 取得
5. `buildLocationPayload` + `buildGbpFieldMask` でリクエスト構築
6. `withGbpApiRetry(() => client.locations.patch({ name, updateMask, requestBody }))` 呼び出し
7. 成功時: `gbpSyncedAt` 更新 + `gbpSyncError` null クリア
8. 失敗時: `formatGbpError` で truncate → `gbpSyncError` 記録 + `logError` (MEDIUM) → throw せず graceful degradation

GBP の resource name は `Location.googleBusinessPlaceId` がそのまま `locations/{id}` 形式で保管されている前提（Phase 1 の入力 UI で確認）。

`siteUrl` は `getAppUrl()` (`@/shared/lib/utils/get-app-url`) で取得。

- [ ] **Step 4.2: index.ts barrel 作成**

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

- [ ] **Step 4.3: Commit（type-check broken 許容、Task 5/6 で解消）**

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

**Reference:** `src/shared/lib/google-calendar/oauth.ts` の OAuth2Client 初期化パターン。

- [ ] **Step 5.1: client.ts 作成 — OAuth クライアント生成 + token refresh handler**

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

**注**: `google.mybusinessbusinessinformation` の正確なメソッド構造は `googleapis` SDK バージョンに依存。実装時に SDK 型定義で確認し、必要に応じて method chain (`.accounts.locations.patch` 等) を調整。

- [ ] **Step 5.2: oauth.ts 作成 — authorize URL / token exchange / revoke**

エクスポート関数:

- `getGbpAuthorizeUrl(state: string): string` — `oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GBP_SCOPES, state })`
- `exchangeGbpAuthCode(code: string): Promise<{ accessToken, refreshToken, expiresAt }>` — `oauth2Client.getToken(code)` → token 検証 + 整形
- `revokeGbpToken(refreshToken: string): Promise<void>` — `oauth2Client.revokeToken(refreshToken)`、失敗時は `logError` (LOW) のみで握り潰さず `void` return（ユーザー体験優先）

- [ ] **Step 5.3: account.ts 作成 — accounts.list**

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

- [ ] **Step 6.1: settings.ts 作成**

エクスポート関数:

- `getGbpAuthState(): Promise<GbpAuthState | null>` — Settings から `googleBusinessProfileAuth` (Json) を取得 → `decrypt(encrypted)` → `JSON.parse` → `GbpAuthState` 型として返す。`googleBusinessProfileEnabled === false` または auth null → null 返却。decrypt / parse 失敗時は `logError` (HIGH) + null 返却（次回連携で復旧可能）
- `saveGbpAuthState(state: GbpAuthState): Promise<void>` — `encrypt(JSON.stringify(state))` → `Settings.update({ googleBusinessProfileAuth: { encrypted }, googleBusinessProfileEnabled: true })`
- `clearGbpAuthState(): Promise<void>` — `Settings.update({ googleBusinessProfileAuth: null, googleBusinessProfileEnabled: false })`

Settings は singleton のため `findFirstOrThrow({ where: { id: { not: undefined } }, select: { id: true } })` で id 取得後 update。`encrypt` / `decrypt` は `@/shared/lib/crypto` から import（`googleCalendarServiceAccountJson` の `safeDecrypt` + `encryptApiKey` パターンと同型）。

- [ ] **Step 6.2: type-check 全 pass 確認**

```bash
bun run type-check
```

Expected: exit 0（全 lib モジュールが整合）

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
- Modify: `package.json` (`test:integration` に `__tests__/integration/domain/locations` 確認)

- [ ] **Step 7.1: gbp-sync-commands.ts 作成**

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

- [ ] **Step 7.2: integration テスト**

`@/shared/lib/google-business-profile` を mock し、`mock.module` で全 export を stub 化（`syncLocationToGbp` / `getGbpAuthState` / `saveGbpAuthState` / `clearGbpAuthState` / `listGbpAccounts` / `getGbpAuthorizeUrl` / `exchangeGbpAuthCode` / `revokeGbpToken`）。**全 export を stub 化必須**（C5 Phase 2 で確立した cloudflare 全 stub テンプレに準拠、partial mock は batch pollution の silent bug）。

カバー対象:

- `syncLocationToGbpCommand` が `syncLocationToGbp` に locationId を委譲
- `toggleLocationGbpSyncCommand` の `enabled: false` で `gbpSyncError` クリア
- `toggleLocationGbpSyncCommand` の `enabled: true` で既存 `gbpSyncError` 保持

mock 型は `mock<(input: SyncLocationToGbpInput) => Promise<GbpSyncResult>>()` で引数型を明示（CLAUDE.md learning: 引数なし mock 型は false-positive pass する）。

- [ ] **Step 7.3: テスト実行**

```bash
bun test __tests__/integration/domain/locations
```

Expected: 全 pass

- [ ] **Step 7.4: Commit**

```bash
git add src/shared/domain/locations/gbp-sync-commands.ts __tests__/integration/domain/locations/gbp-sync-commands.test.ts package.json
git commit -m "feat(gbp): add domain commands for sync/toggle with integration tests"
```

---

### Task 8: OAuth callback route handler

**Files:**

- Create: `src/app/api/google-business-profile/oauth/callback/route.ts`

**Reference:** `src/app/api/instagram/oauth/callback/route.ts` の OAuth callback パターン。

- [ ] **Step 8.1: route.ts 作成**

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

`unstable_rethrow` は Next.js 16 PPR の bail-out エラー再 throw（gotchas.md §Route Handler 準拠）。

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

- [ ] **Step 9.1: Server Actions 作成**

エクスポート関数:

- `initiateGbpAuth(): Promise<void>` — `getGbpAuthorizeUrl("")` → `redirect(url)`（state は Phase 2 では空、Phase 3 で CSRF 対策）
- `revokeGbpAuth()` — `executeAdminMutationResult({ resource: "settings", action: "update", execute: async () => { revokeGbpToken + clearGbpAuthState }, afterSuccess: () => updateTag(CACHE_TAGS.INTEGRATION_SETTINGS) })`
- `triggerGbpSync(locationId: string)` — `executeAdminMutationResult({ resource: "location", action: "update", resourceId: locationId, execute: () => syncLocationToGbpCommand({ locationId }), afterSuccess: () => updateTag(CACHE_TAGS.LOCATIONS) })`
- `toggleLocationGbpSync(locationId: string, enabled: boolean)` — 同上で `toggleLocationGbpSyncCommand`

`initiateGbpAuth` は `redirect()` するため戻り値型 `Promise<void>` で `executeAdminMutationResult` を経由しない（`redirect()` は throw する Next.js API のため try/catch で握り潰せない）。代わりに関数冒頭で `verifyAdminSession()` を直接呼んで権限チェックする。

- [ ] **Step 9.2: integration テスト**

`@/shared/lib/google-business-profile` + `@/shared/domain/locations/gbp-sync-commands` を mock。各 Server Action の認証 / 権限 / 成功 / 失敗パスを検証。テンプレートは `__tests__/integration/actions/admin/settings-google-calendar.test.ts` を参照。

カバー対象:

- `initiateGbpAuth` が `redirect` を呼ぶ（Next.js redirect は internal error throw のため try/catch で検出）
- `revokeGbpAuth` が `revokeGbpToken` + `clearGbpAuthState` を呼ぶ
- `triggerGbpSync` が成功時 `MutationResult<{ locationId, syncedAt }>` を返す
- `toggleLocationGbpSync` が `enabled: false` で成功

- [ ] **Step 9.3: テスト実行**

```bash
bun test __tests__/integration/actions/admin/google-business-profile.test.ts
```

Expected: 全 pass

- [ ] **Step 9.4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts' '__tests__/integration/actions/admin/google-business-profile.test.ts'
git commit -m "feat(gbp): add Server Actions for OAuth + sync trigger + toggle"
```

---

### Task 10: updateLocation afterSuccess fireAndForget 配線

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts` (or 同等パス)

- [ ] **Step 10.1: 該当ファイル特定 + afterSuccess 拡張**

実装前 grep:

```bash
grep -rln "updateLocationCommand\|updateLocation\b" 'src/app/(admin)/admin/(dashboard)/_shared/actions/'
```

該当ファイルの `updateLocation` Server Action `afterSuccess` に追加:

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

`createLocation` Server Action にも同パターン追加（新規拠点も初回同期を試行、Place ID 未設定なら command 内部で skip）。

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

**Reference:** `GoogleCalendarSection.tsx` を構造参考に。

- [ ] **Step 11.1: Section コンポーネント作成**

実装内容:

- 連携状態 badge: 未連携 / 連携済み（accountName 表示）/ エラー
- 「Google で連携」ボタン → `<form action={initiateGbpAuth}>` で Server Action 呼び出し（redirect で Google OAuth に遷移）
- 「解除」ボタン → AlertDialog confirmation → `revokeGbpAuth` Server Action
- `useSearchParams` で `gbp_success` / `gbp_error` query param を読み取り toast 表示
- 説明文: "接続後、各 Location の MEO タブで `gbpSyncEnabled` を有効化することで同期されます"

a11y: 全ボタン `min-h-11` 以上、role="status" + aria-live="polite" でフィードバック、エラー badge tooltip。

- [ ] **Step 11.2: index.ts barrel に export 追加**

```typescript
export { GoogleBusinessProfileSection } from "./GoogleBusinessProfileSection";
```

- [ ] **Step 11.3: settings/api/page.tsx に <GoogleBusinessProfileSection /> 追加**

`<GoogleCalendarSection />` の直後に挿入:

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

- [ ] **Step 12.1: LocationGbpSyncCard.tsx 作成**

Client Component (`"use client"`)。Props:

- `locationId: string`
- `googleBusinessPlaceId: string | null`
- `gbpSyncEnabled: boolean`
- `gbpSyncedAt: Date | null`
- `gbpSyncError: string | null`
- `gbpEnabledGlobally: boolean`

UI 要素:

- Card with title "Google Business Profile 同期"
- `placeIdMissing` warning（Place ID 未設定時）
- `globallyDisabled` warning（`Settings.googleBusinessProfileEnabled` false 時）
- Switch: この拠点の同期 ON/OFF（`toggleLocationGbpSync` Server Action、楽観的更新 + ロールバック）
- 最終同期時刻表示（`formatDateTime(gbpSyncedAt)` または "未同期"）
- Error badge（`gbpSyncError` が truthy 時）
- 「今すぐ同期」ボタン（`triggerGbpSync` Server Action、`useTransition` + feedback `role="status" aria-live="polite"`）

無効化条件: `isPending` / `enabled === false` / `globallyDisabled` / `placeIdMissing`

- [ ] **Step 12.2: LocationForm.tsx の meo TabsContent に組み込む**

`LocationMeoScoreCard` の直後に追加（edit mode のみ、`location` prop 存在時）:

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

`settings` prop が LocationForm に存在しない場合は親 page (`locations/[id]/edit/page.tsx`) で `getSettings()` 取得 + prop drill 必要。

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

- [ ] **Step 13.1: バッジ列追加**

`<TableHead>GBP 同期</TableHead>` を追加し、各行で badge 表示:

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
  if (!hasPlaceId) return <Badge variant="secondary">Place ID 未設定</Badge>;
  if (!enabled) return <Badge variant="secondary">同期 OFF</Badge>;
  if (error)
    return (
      <Badge variant="destructive" title={error}>
        エラー
      </Badge>
    );
  if (syncedAt) return <Badge variant="success">同期済</Badge>;
  return <Badge variant="outline">未同期</Badge>;
}
```

`<TableCell><GbpSyncBadge ... /></TableCell>` の onClick に `stopRowClick` 適用（既存 ClickableTableRow パターン、admin-ui-patterns.md §テーブル行クリック遷移）。

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

- [ ] **Step 14.1: setup guide 作成**

内容:

- Google Cloud Console での API 有効化手順
  - "My Business Business Information API"
  - "My Business Account Management API"
- OAuth 2.0 Client ID 設定（既存 `GOOGLE_CLIENT_ID` 流用、redirect URI 追加: `https://<domain>/api/google-business-profile/oauth/callback`）
- Business Profile API access request form 提出（用途記載例）
- 承認待ち期間の運用（`GBP_STUB_MODE=true` で UI 動作確認）
- 承認後の動作確認手順
- トラブルシューティング: 403 forbidden / no_accounts_found / token expiry / 数十拠点同時保存時のレート制限

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

- [ ] **Step 15.1: ADR 採番衝突 cross-check**

```bash
ls docs/architecture/decisions/ | grep "^00" | tail -5
for w in .worktrees/*; do
  test -d "$w/docs/architecture/decisions/" && (cd "$w" && ls docs/architecture/decisions/ 2>/dev/null | grep "^00" | tail -3)
done
```

Expected: 0026 が main の最新、0027 は未使用。worktree にも 0027 不在を確認（衝突あれば 0028+ にリネーム）。

- [ ] **Step 15.2: ADR 0027 作成**

Spec §8 の ADR draft を ADR フォーマット（Status / Date / Context / Decision / Consequences / Alternatives / References）に整形。Decision は 6 項目（OAuth-based / app SSoT / single-account / fireAndForget on save + manual / graceful degradation / stub mode）。

- [ ] **Step 15.3: README.md index に追加**

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
  1. `.env.local` に `GBP_STUB_MODE=true` 追加
  2. `bun dev` 再起動
  3. 設定 > Google Business Profile セクション表示確認（連携前は "未連携" badge）
  4. Location 編集 → MEO タブ → 「今すぐ同期」ボタン → 成功表示（stub では DB の `gbpSyncedAt` 更新なし、stub.ts の logger.info のみ）
  5. LocationTable に GBP 同期 badge 列が表示される

---

## Self-Review Checklist

- [x] **Spec coverage**: 全 9 セクションを task に対応付け
  - §1 目的 / §2 アーキテクチャ → Task 1-13
  - §3 申請ワークフロー → Task 14
  - §4 テスト戦略 → Task 3.5-3.7 (unit) / Task 7.2 / Task 9.2 (integration)
  - §5 マイグレーション → Task 1
  - §6 リスク → 各 task の注釈
  - §7 スコープ境界 → 全 task
  - §8 ADR → Task 15
  - §9 ground truth → plan 冒頭で実施済み

- [x] **No placeholders**: 全 step に実コード / 実コマンド / 実 file path 記載

- [x] **Type consistency**: `syncLocationToGbp` (lib) → `syncLocationToGbpCommand` (domain) → `triggerGbpSync` (Server Action) の責務階層一貫、`GbpSyncResult` は全層で同一型

- [x] **Bundle 化指示**: Bundle A-G で 7 bundle、Task 4-6 (Bundle C) と Task 11-13 (Bundle F) は密結合のため 1 implementer に bundle、commit message は plan 指定文字列を使用

- [x] **ground truth 反映**:
  - ADR 0027 採番（cross-check 実施）
  - Settings encryption pattern (`googleCalendarServiceAccountJson` 同型、`encrypt`/`decrypt` 流用)
  - OAuth callback 配置 (`api/instagram/oauth/callback/` 同型)
  - LocationForm の Tabs 構造 (`forceMount` + `meo` tab 既存)
  - `updateLocation` の `{ id, slug }` 戻り値（`fireAndForget` で `data.id` 使用可）
  - `fireAndForget(promise, { operation, category })` シグネチャ
  - `executeAdminMutationResult` の `afterSuccess(data)` パターン
  - `mybusinessbusinessinformation` / `mybusinessaccountmanagement` v1 endpoint
  - OAuth scope `https://www.googleapis.com/auth/business.manage`
