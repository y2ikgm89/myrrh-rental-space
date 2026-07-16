# Online Events (Phase B.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Event に `format` / `meetingUrl` / `meetingProvider` を追加してオンライン開催 / ハイブリッド開催を業界標準 (schema.org / RFC 5545 / GCal / Eventbrite / Meetup) に準拠して実装し、冗長な `Settings.googleCalendarMeetEnabled` を破壊的に DROP して per-event 制御に一本化する。

**Architecture:** Eventbrite / Meetup と同一の「physical location + meeting URL の 2 系統 flat」pattern。Event 本体に 3 列 add-only、Settings に 1 列 DROP。DB CHECK 制約で ONLINE/HYBRID + MANUAL provider + URL 未入力を禁止。schema.org JSON-LD は `eventAttendanceMode` 3 値 + `location` polymorphic array を完全出力。iCal は RFC 5545 `LOCATION` + `URL` 併記。GCal は per-event `conferenceData.createRequest` + `hangoutLink` の Event.meetingUrl への write-back。参加 URL 開示は Eventbrite / Meetup 標準に従い登録完了者のみ (公開ページは「URL は登録完了メールで配信」ラベルのみ)。

**Tech Stack:** Prisma 7 + PostgreSQL 16 (breaking migration = 計画ダウンタイム deploy) / Next.js 16 App Router (`use cache` + `cacheTag`) / Zod 4 + conform / bun test (per-file 隔離 runner) / Playwright / ical-generator@11 (既存) / googleapis (既存)

**Spec:** [docs/superpowers/specs/2026-07-16-online-events-phase-b1-design.md](../specs/2026-07-16-online-events-phase-b1-design.md)

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行 (素の `bun test` は mock.module プロセス汚染で壊れる)
- `bun run validate` はテストを含まない (type-check + lint のみ)。「テスト緑」は test コマンド実出力でのみ主張
- Prisma import は `@/shared/db/prisma` からのみ。import する file は `import "server-only"` 必須
- `src/app/*` から Prisma / `@generated/prisma` の直 import 禁止 (enum は `@/shared/lib/validations/enums/prisma-types` 経由)
- `cacheComponents: true` のため route segment config 全面禁止。動的化は `await connection()` で
- キャッシュタグの文字列直書き禁止。`CACHE_TAGS` (`src/shared/lib/constants/cache.ts`) 経由
- `any` / non-null `!` / `@ts-ignore` / 危険 cast は grep gate で 0 件強制。CHECK: 型が `unknown` 由来の値を触るときは `isRecord` (`src/shared/lib/serialize.ts`) 経由
- 既存 `prisma/migrations/*/migration.sql` は編集禁止。修正は新規 migration で
- `TermsAgreement` / `AuditLog` は append-only (update/delete 禁止)
- 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter を使う
- main への push = 即・本番デプロイ。DROP を含む migration は自動で計画ダウンタイム付きデプロイに切替 (**Task 1 → 本 PR の deploy で 5-10 分ダウン**)
- Bun 1.3.14 (`packageManager` が SSoT) / TypeScript 6.0.3 (exact pin)
- **本 PR は破壊的変更を含む** (ユーザー承認済): `Settings.googleCalendarMeetEnabled` DROP、Reservation 側 Meet URL 発行機能廃止
- **Pre-migration audit (writing-plans 実行者は Task 1 開始前に user に確認)**: 本番 Settings.googleCalendarMeetEnabled は false ですか？(true の場合は spec goal-9 の再ブレストが必要)

---

## File Structure

**PR 1 (schema + domain + integration)**

| File                                                                                          | 責務                                                                                                                                | Task |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `prisma/schema.prisma`                                                                        | `EventFormat` / `MeetingProvider` enum + `Event.format/meetingUrl/meetingProvider` 追加 + `Settings.googleCalendarMeetEnabled` DROP | 1    |
| `prisma/migrations/<timestamp>_add_event_online_format/migration.sql`                         | ADD COLUMN + CHECK + DROP COLUMN                                                                                                    | 1    |
| `src/shared/lib/validations/enums/prisma-types.ts`                                            | `EVENT_FORMAT` / `MEETING_PROVIDER` / `EVENT_FORMAT_TO_SCHEMA_ORG` SSoT                                                             | 2    |
| `src/shared/domain/events/venue.ts`                                                           | `formatEventVenueDisplay` / `isEventVirtualAccessible` helper 追加                                                                  | 3    |
| `src/shared/domain/events/commands.ts`                                                        | create/update input Zod schema に 3 field 追加 + refine + OFFLINE 時の meetingUrl null リセット                                     | 4    |
| `src/shared/domain/events/public-queries.ts` / `admin-queries.ts` / `registration-queries.ts` | select に 3 field 追加 (registration 側は meetingUrl 含む)                                                                          | 5    |
| `src/shared/domain/events/calendar-sync.ts`                                                   | `writeBackMeetingUrl` 追加 + `getEventSlotsForCalendarSync` select 拡張                                                             | 6    |
| `src/shared/lib/google-calendar/events.ts`                                                    | `settings.meetEnabled` 参照削除 + `buildEventBody` を `options.withMeet` per-event 判定に                                           | 7    |
| `src/shared/domain/settings/*` (types, admin-queries)                                         | `GoogleCalendarSettingsData` から `meetEnabled` 削除                                                                                | 7    |
| `src/shared/lib/calendar-sync/outbound/*` (event sync)                                        | GCal 応答から `hangoutLink` 抽出 → `writeBackMeetingUrl` 呼出                                                                       | 8    |
| `src/shared/lib/calendar-sync/outbound/*` (reservation sync)                                  | 予約 GCal 呼出時の `withMeet` を常に false 化 (Reservation Meet 廃止)                                                               | 8    |
| `src/shared/lib/ical/index.ts` / `types.ts`                                                   | `buildEventCalendar` に `URL` field 追加、ONLINE 時 LOCATION を "オンライン開催" に                                                 | 9    |
| `__tests__/unit/lib/enums/event-format.test.ts`                                               | schema.org mapping consistency + enum values                                                                                        | 2    |
| `__tests__/unit/domain/events/venue.test.ts`                                                  | display / isVirtual の 3 format × 物理会場組合せ                                                                                    | 3    |
| `__tests__/unit/domain/events/commands.test.ts`                                               | Zod refine (format × provider × URL 全組合せ)                                                                                       | 4    |
| `__tests__/integration/domain/events/online-format.test.ts`                                   | 実 DB CHECK 制約検証 + create/update round-trip                                                                                     | 5, 6 |
| `__tests__/unit/lib/google-calendar/events.test.ts`                                           | `buildEventBody` per-event 判定                                                                                                     | 7    |
| `__tests__/integration/lib/calendar-sync/meet-writeback.test.ts`                              | mocked GCal → `Event.meetingUrl` write-back                                                                                         | 8    |
| `__tests__/unit/lib/ical/event-online.test.ts`                                                | ONLINE / HYBRID の URL / LOCATION 出力                                                                                              | 9    |

**PR 2 (UI + JSON-LD + email + mypage + E2E)**

| File                                                                                  | 責務                                                          | Task |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| `src/app/(admin)/admin/(dashboard)/settings/_components/*`                            | `googleCalendarMeetEnabled` 入力欄削除                        | 10   |
| `src/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector.tsx` | 「開催形態」ToggleGroup + OnlineMeetingFields                 | 11   |
| `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx` + form-schema    | meetingUrl / meetingProvider field 追加                       | 12   |
| `src/app/(public)/events/[slug]/page.tsx`                                             | 会場表示 + 「URL はメールで」ラベル                           | 13   |
| `src/app/(public)/events/[slug]/_components/EventJsonLd.tsx` (or inline)              | `eventAttendanceMode` 3 値 + `location` polymorphic array     | 14   |
| `src/shared/email/templates/EventRegistrationConfirmation/*.tsx` + fixture            | ONLINE/HYBRID 時に URL section 追加                           | 15   |
| `src/app/(public)/mypage/events/[registrationId]/*` (customer + guest claim)          | `meetingUrl` 表示                                             | 16   |
| `e2e/tests/admin-authenticated/events-create-online.spec.ts`                          | admin online create → public 表示 → JSON-LD 検証              | 17   |
| `__tests__/unit/architecture-boundaries.test.ts`                                      | `meetingUrl` を public page JSX で直接参照する箇所ゼロを gate | 18   |

---

### Task 1: Prisma schema + migration (breaking)

**Files:**

- Modify: `prisma/schema.prisma` (Event model + Settings model + 2 enums)
- Create: `prisma/migrations/<timestamp>_add_event_online_format/migration.sql` (via `db:migrate --name`)

**Interfaces:**

- Consumes: 既存 Event / Settings model
- Produces:
  - `EventFormat` enum (`OFFLINE | ONLINE | HYBRID`) available in Prisma client
  - `MeetingProvider` enum (`MANUAL | GOOGLE_MEET`) available in Prisma client
  - `Event.format: EventFormat` (default OFFLINE), `Event.meetingUrl: String? @db.VarChar(500)`, `Event.meetingProvider: MeetingProvider` (default MANUAL)
  - `Settings.googleCalendarMeetEnabled` **削除**

- [ ] **Step 1: schema.prisma を編集**

Event enum セクション (既存 EventScheduleMode の近く) に追加:

```prisma
enum EventFormat {
  OFFLINE
  ONLINE
  HYBRID
}

enum MeetingProvider {
  MANUAL
  GOOGLE_MEET
}
```

Event model に 3 field 追加 (既存 field の末尾、`@@index` の直前):

```prisma
model Event {
  // ... existing fields ...
  format          EventFormat      @default(OFFLINE)
  meetingUrl      String?          @db.VarChar(500)
  meetingProvider MeetingProvider  @default(MANUAL)
  // ... existing @@index / @@map ...
}
```

Settings model から削除:

```prisma
model Settings {
  // ...
  // DELETE: googleCalendarMeetEnabled  Boolean  @default(false)
  googleCalendarReminderMinutes  Int?  // 維持
  // ...
}
```

- [ ] **Step 2: migration 生成**

```bash
bun run db:migrate --name add_event_online_format
```

Expected: `prisma/migrations/<timestamp>_add_event_online_format/migration.sql` が作成される

- [ ] **Step 3: 生成された migration.sql に CHECK 制約を手動追加**

`ADD COLUMN` と `DROP COLUMN` の後に以下を追記:

```sql
-- CHECK: ONLINE/HYBRID + MANUAL provider は meetingUrl 必須
ALTER TABLE "Event" ADD CONSTRAINT "event_online_meeting_url_required"
CHECK (
  ("format" = 'OFFLINE')
  OR ("meetingProvider" = 'GOOGLE_MEET')
  OR ("meetingUrl" IS NOT NULL)
);
```

- [ ] **Step 4: migration 再適用 (CHECK 反映)**

```bash
bun run db:migrate --name add_event_online_format
```

Expected: 「already applied」or CHECK が追加されて再 apply 成功。既存行が全て `format=OFFLINE` のため CHECK 違反なし。

- [ ] **Step 5: squawk lint 通過確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture/migration-safety.test.ts
```

Expected: PASS (breaking migration の DROP は既定で許可されている、CLAUDE.md rule 11 に対応)

- [ ] **Step 6: Prisma client 再生成 + 既存 seed で smoke 確認**

```bash
bun run db:generate
bun run db:seed
```

Expected: seed 成功、既存 event 全てが `format=OFFLINE`

- [ ] **Step 7: commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(events)!: Event に format/meetingUrl/meetingProvider 追加、Settings.googleCalendarMeetEnabled DROP (Phase B.1 task 1)"
```

---

### Task 2: Enum SSoT (prisma-types.ts)

**Files:**

- Modify: `src/shared/lib/validations/enums/prisma-types.ts`
- Test: `__tests__/unit/lib/enums/event-format.test.ts` (新規)

**Interfaces:**

- Consumes: `EventFormat` / `MeetingProvider` from `@generated/prisma/enums`
- Produces:
  - `EVENT_FORMAT: { OFFLINE, ONLINE, HYBRID }` const
  - `EVENT_FORMAT_VALUES: EventFormatValue[]`
  - `MEETING_PROVIDER: { MANUAL, GOOGLE_MEET }` const
  - `MEETING_PROVIDER_VALUES: MeetingProviderValue[]`
  - `EVENT_FORMAT_TO_SCHEMA_ORG: Record<EventFormatValue, string>` (schema.org mapping)

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/lib/enums/event-format.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  EVENT_FORMAT,
  EVENT_FORMAT_VALUES,
  EVENT_FORMAT_TO_SCHEMA_ORG,
  MEETING_PROVIDER,
  MEETING_PROVIDER_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";

describe("EVENT_FORMAT", () => {
  test("3 値を持つ", () => {
    expect(EVENT_FORMAT_VALUES).toEqual(["OFFLINE", "ONLINE", "HYBRID"]);
  });
});

describe("EVENT_FORMAT_TO_SCHEMA_ORG", () => {
  test("schema.org eventAttendanceMode と 1:1 mapping", () => {
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.OFFLINE]).toBe(
      "OfflineEventAttendanceMode",
    );
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.ONLINE]).toBe(
      "OnlineEventAttendanceMode",
    );
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.HYBRID]).toBe(
      "MixedEventAttendanceMode",
    );
  });

  test("全 EVENT_FORMAT 値が mapping に含まれる", () => {
    for (const value of EVENT_FORMAT_VALUES) {
      expect(EVENT_FORMAT_TO_SCHEMA_ORG[value]).toBeString();
    }
  });
});

describe("MEETING_PROVIDER", () => {
  test("2 値を持つ", () => {
    expect(MEETING_PROVIDER_VALUES).toEqual(["MANUAL", "GOOGLE_MEET"]);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/enums/event-format.test.ts
```

Expected: FAIL (export not found)

- [ ] **Step 3: prisma-types.ts に enum SSoT 追加**

`src/shared/lib/validations/enums/prisma-types.ts` 末尾 (既存 pattern と一致する形):

```ts
// EventFormat: 開催形態 (schema.org eventAttendanceMode 3 値と 1:1)
export const EVENT_FORMAT = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  HYBRID: "HYBRID",
} as const;
export type EventFormatValue = (typeof EVENT_FORMAT)[keyof typeof EVENT_FORMAT];
export const EVENT_FORMAT_VALUES = Object.values(
  EVENT_FORMAT,
) as EventFormatValue[];

export const EVENT_FORMAT_TO_SCHEMA_ORG = {
  OFFLINE: "OfflineEventAttendanceMode",
  ONLINE: "OnlineEventAttendanceMode",
  HYBRID: "MixedEventAttendanceMode",
} as const satisfies Record<EventFormatValue, string>;

// MeetingProvider: オンライン会議発行元
export const MEETING_PROVIDER = {
  MANUAL: "MANUAL",
  GOOGLE_MEET: "GOOGLE_MEET",
} as const;
export type MeetingProviderValue =
  (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];
export const MEETING_PROVIDER_VALUES = Object.values(
  MEETING_PROVIDER,
) as MeetingProviderValue[];
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/enums/event-format.test.ts
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/validations/enums/prisma-types.ts __tests__/unit/lib/enums/event-format.test.ts
git commit -m "feat(events): EVENT_FORMAT / MEETING_PROVIDER enum SSoT + schema.org mapping (Phase B.1 task 2)"
```

---

### Task 3: venue.ts helpers

**Files:**

- Modify: `src/shared/domain/events/venue.ts`
- Test: `__tests__/unit/domain/events/venue.test.ts` (既存があれば拡張、無ければ新規)

**Interfaces:**

- Consumes: 既存 `formatEventVenue` / `formatEventAddress`
- Produces:
  - `formatEventVenueDisplay(event): { primary: string | null; secondary: string | null }` — public UI 用
  - `isEventVirtualAccessible(event): boolean` — ONLINE / HYBRID 判定

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/events/venue.test.ts` (既存があれば `describe` 追加、無ければ新規):

```ts
import { describe, expect, test } from "bun:test";
import {
  formatEventVenueDisplay,
  isEventVirtualAccessible,
} from "@/shared/domain/events/venue";

describe("formatEventVenueDisplay", () => {
  test("OFFLINE: primary = 物理会場、secondary = null", () => {
    const result = formatEventVenueDisplay({
      format: "OFFLINE",
      meetingUrl: null,
      location: { name: "渋谷 A" },
      space: { name: "301 号室" },
      addressDetail: null,
    });
    expect(result.primary).toBe("渋谷 A / 301 号室");
    expect(result.secondary).toBeNull();
  });

  test("ONLINE: primary = 'オンライン開催'、secondary = null", () => {
    const result = formatEventVenueDisplay({
      format: "ONLINE",
      meetingUrl: "https://meet.google.com/x",
      location: null,
      space: null,
      addressDetail: null,
    });
    expect(result.primary).toBe("オンライン開催");
    expect(result.secondary).toBeNull();
  });

  test("HYBRID: primary = 物理会場、secondary = 'オンラインでも参加可'", () => {
    const result = formatEventVenueDisplay({
      format: "HYBRID",
      meetingUrl: "https://meet.google.com/x",
      location: { name: "渋谷 A" },
      space: { name: "301 号室" },
      addressDetail: null,
    });
    expect(result.primary).toBe("渋谷 A / 301 号室");
    expect(result.secondary).toBe("オンラインでも参加可");
  });
});

describe("isEventVirtualAccessible", () => {
  test("OFFLINE → false", () => {
    expect(isEventVirtualAccessible({ format: "OFFLINE" })).toBe(false);
  });
  test("ONLINE → true", () => {
    expect(isEventVirtualAccessible({ format: "ONLINE" })).toBe(true);
  });
  test("HYBRID → true", () => {
    expect(isEventVirtualAccessible({ format: "HYBRID" })).toBe(true);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/events/venue.test.ts
```

Expected: FAIL (export not found)

- [ ] **Step 3: 実装追加**

`src/shared/domain/events/venue.ts` に追加 (既存 `formatEventVenue` を利用):

```ts
import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

type EventVenueDisplayInput = {
  format: EventFormatValue;
  meetingUrl: string | null;
  location?: { name: string } | null;
  space?: { name: string } | null;
  addressDetail?: string | null;
};

export function formatEventVenueDisplay(event: EventVenueDisplayInput): {
  primary: string | null;
  secondary: string | null;
} {
  const physical = formatEventVenue(event);
  switch (event.format) {
    case "OFFLINE":
      return { primary: physical, secondary: null };
    case "ONLINE":
      return { primary: "オンライン開催", secondary: null };
    case "HYBRID":
      return { primary: physical, secondary: "オンラインでも参加可" };
  }
}

export function isEventVirtualAccessible(event: {
  format: EventFormatValue;
}): boolean {
  return event.format === "ONLINE" || event.format === "HYBRID";
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/events/venue.test.ts
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/events/venue.ts __tests__/unit/domain/events/venue.test.ts
git commit -m "feat(events): formatEventVenueDisplay / isEventVirtualAccessible helper 追加 (Phase B.1 task 3)"
```

---

### Task 4: commands.ts Zod schema 拡張

**Files:**

- Modify: `src/shared/domain/events/commands.ts` (`createEventCommand` / `updateEventCommand` の Zod schema)
- Test: `__tests__/unit/domain/events/commands.test.ts` (既存 test file を拡張)

**Interfaces:**

- Consumes: `EVENT_FORMAT_VALUES` / `MEETING_PROVIDER_VALUES` from Task 2
- Produces:
  - Zod input schema に `format` / `meetingUrl` / `meetingProvider` 追加
  - refine: `format ∈ {ONLINE, HYBRID}` かつ `meetingProvider === MANUAL` → `meetingUrl` 必須 (HTTPS URL, ≤500 chars)
  - `format === OFFLINE` の update 時、`meetingUrl` を null に、`meetingProvider` を MANUAL にリセット

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/events/commands.test.ts` に describe block を追加:

```ts
import { describe, expect, test } from "bun:test";
// 既存 import
// commands の Zod schema を直接 test。実装は createEventCommand から export される
// eventInputSchema を利用 (spec §4.2 参照)

describe("createEventCommand input validation (Phase B.1)", () => {
  test("OFFLINE: meetingUrl / meetingProvider 未指定でも valid", () => {
    // TODO: eventInputSchema.safeParse で valid ケース
  });

  test("ONLINE + MANUAL + meetingUrl 未指定 → invalid", () => {
    // eventInputSchema.safeParse で "会議 URL が必須です" error
  });

  test("ONLINE + MANUAL + meetingUrl 指定 → valid", () => {
    /* ... */
  });

  test("ONLINE + GOOGLE_MEET + meetingUrl 未指定 → valid (自動発行で write-back)", () => {
    /* ... */
  });

  test("HYBRID + MANUAL + meetingUrl 未指定 → invalid", () => {
    /* ... */
  });

  test("meetingUrl が http:// → invalid (HTTPS 必須)", () => {
    /* ... */
  });

  test("meetingUrl が 501 chars → invalid (500 char 上限)", () => {
    /* ... */
  });
});
```

`TODO` を具体的な `expect` 付き test に埋める (試験実行前に完成させる)。

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/events/commands.test.ts
```

Expected: FAIL (import 失敗 or schema に field 未定義)

- [ ] **Step 3: commands.ts の Zod schema 拡張**

既存の `eventInputSchema` (create / update 共通) に追加:

```ts
import {
  EVENT_FORMAT_VALUES,
  MEETING_PROVIDER_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";

const eventInputSchema = z
  .object({
    // ... existing fields
    format: z.enum(EVENT_FORMAT_VALUES).default("OFFLINE"),
    meetingUrl: z
      .string()
      .url()
      .startsWith("https://")
      .max(500)
      .nullable()
      .optional(),
    meetingProvider: z.enum(MEETING_PROVIDER_VALUES).default("MANUAL"),
  })
  .refine(
    (data) => {
      if (data.format === "OFFLINE") return true;
      if (data.meetingProvider === "GOOGLE_MEET") return true;
      return typeof data.meetingUrl === "string" && data.meetingUrl.length > 0;
    },
    {
      error:
        "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
      path: ["meetingUrl"],
    },
  );
```

`updateEventCommand` の domain layer (Prisma update 実行前) で、`format === "OFFLINE"` の場合に `meetingUrl: null, meetingProvider: "MANUAL"` に明示リセット:

```ts
if (input.format === "OFFLINE") {
  input.meetingUrl = null;
  input.meetingProvider = "MANUAL";
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/events/commands.test.ts
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/events/commands.ts __tests__/unit/domain/events/commands.test.ts
git commit -m "feat(events): commands.ts で format/meetingUrl/meetingProvider 受入 + refine (Phase B.1 task 4)"
```

---

### Task 5: queries 拡張 + integration test

**Files:**

- Modify: `src/shared/domain/events/public-queries.ts` (`publicEventSelect` に 3 field 追加、ただし `meetingUrl` は SELECT のみ、公開 JSX render はしない)
- Modify: `src/shared/domain/events/admin-queries.ts` (`adminEventSelect` に 3 field 追加)
- Modify: `src/shared/domain/events/registration-queries.ts` (登録済ユーザー向け return type に `meetingUrl` 含む)
- Test: `__tests__/integration/domain/events/online-format.test.ts` (新規、実 DB CHECK 制約検証 + create/update round-trip)

**Interfaces:**

- Produces:
  - `publicEventSelect` / `adminEventSelect` の返却型に `format` / `meetingUrl` / `meetingProvider` 含まれる
  - registration 詳細 (`getRegistrationDetailForCustomer` / `getRegistrationByToken`) の返却型 `event.meetingUrl` 含む

- [ ] **Step 1: 失敗する integration test を書く**

`__tests__/integration/domain/events/online-format.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import {
  EVENT_FORMAT,
  MEETING_PROVIDER,
} from "@/shared/lib/validations/enums/prisma-types";
// 既存 test helper (event factory)

describe("Event online format (integration)", () => {
  test("CHECK: ONLINE + MANUAL + meetingUrl null → DB reject", async () => {
    await expect(
      prisma.event.create({
        data: {
          // 必須 field は最小限
          title: "test",
          slug: `test-online-${Date.now()}`,
          format: EVENT_FORMAT.ONLINE,
          meetingProvider: MEETING_PROVIDER.MANUAL,
          meetingUrl: null,
          // ... 他必須 field
        },
      }),
    ).rejects.toThrow(); // Postgres CHECK 違反
  });

  test("ONLINE + MANUAL + meetingUrl 指定 → 保存成功、round-trip", async () => {
    const event = await prisma.event.create({
      data: {
        title: "test",
        slug: `test-online-ok-${Date.now()}`,
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
        meetingUrl: "https://meet.google.com/example",
        // ... 他必須 field
      },
    });
    expect(event.format).toBe("ONLINE");
    expect(event.meetingUrl).toBe("https://meet.google.com/example");
  });

  test("ONLINE + GOOGLE_MEET + meetingUrl null → 保存成功 (write-back 待ち状態)", async () => {
    const event = await prisma.event.create({
      data: {
        title: "test",
        slug: `test-online-gmeet-${Date.now()}`,
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
        meetingUrl: null,
        // ...
      },
    });
    expect(event.meetingUrl).toBeNull();
  });

  test("既存 event の default が OFFLINE + MANUAL", async () => {
    const event = await prisma.event.create({
      data: {
        title: "test",
        slug: `test-default-${Date.now()}`,
        // format / meetingProvider を省略
        // ...
      },
    });
    expect(event.format).toBe("OFFLINE");
    expect(event.meetingProvider).toBe("MANUAL");
    expect(event.meetingUrl).toBeNull();
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認 (queries が未拡張なら select が undefined を返す)**

```bash
bun run test:integration __tests__/integration/domain/events/online-format.test.ts
```

Expected: FAIL (select 経路が field 未取得 or CHECK 未反映)

- [ ] **Step 3: queries の select 拡張**

各 file で:

```ts
// public-queries.ts
export const publicEventSelect = {
  // ... existing
  format: true,
  meetingUrl: true, // SELECT のみ、公開 JSX render 禁止 (business rule)
  meetingProvider: true,
} satisfies Prisma.EventSelect;

// admin-queries.ts (admin は全 field 見れる)
export const adminEventSelect = {
  // ... existing
  format: true,
  meetingUrl: true,
  meetingProvider: true,
} satisfies Prisma.EventSelect;

// registration-queries.ts の getRegistrationDetailForCustomer / getRegistrationByToken
// select の event 部分に上記 3 field 追加
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/domain/events/online-format.test.ts
```

Expected: PASS (CHECK 制約 3 case + default 1 case)

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/events/*.ts __tests__/integration/domain/events/
git commit -m "feat(events): queries に format/meetingUrl/meetingProvider select 追加 + 実 DB CHECK 制約 integration test (Phase B.1 task 5)"
```

---

### Task 6: calendar-sync.ts writeBackMeetingUrl

**Files:**

- Modify: `src/shared/domain/events/calendar-sync.ts`
- Test: 既存 `__tests__/integration/domain/events/online-format.test.ts` を拡張

**Interfaces:**

- Consumes: `prisma.event.update`
- Produces:
  - `writeBackMeetingUrl({ eventId, meetingUrl }): Promise<void>` — GCal 発行 URL を Event.meetingUrl に upsert
  - `getEventSlotsForCalendarSync()` の select に `format` / `meetingUrl` / `meetingProvider` を追加

- [ ] **Step 1: 失敗する test を追加**

既存 file に describe 追加:

```ts
describe("writeBackMeetingUrl", () => {
  test("Event.meetingUrl を上書き保存する", async () => {
    const event = await prisma.event.create({
      data: {
        title: "test",
        slug: `test-writeback-${Date.now()}`,
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
        meetingUrl: null,
        // ...
      },
    });
    const { writeBackMeetingUrl } =
      await import("@/shared/domain/events/calendar-sync");
    await writeBackMeetingUrl({
      eventId: event.id,
      meetingUrl: "https://meet.google.com/generated",
    });
    const updated = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(updated.meetingUrl).toBe("https://meet.google.com/generated");
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun run test:integration __tests__/integration/domain/events/online-format.test.ts
```

Expected: FAIL (`writeBackMeetingUrl` not exported)

- [ ] **Step 3: 実装追加**

`src/shared/domain/events/calendar-sync.ts` に追加:

```ts
export async function writeBackMeetingUrl({
  eventId,
  meetingUrl,
}: {
  eventId: string;
  meetingUrl: string;
}): Promise<void> {
  await prisma.event.update({
    where: { id: eventId },
    data: { meetingUrl },
  });
}
```

`getEventSlotsForCalendarSync()` の select に `format` / `meetingUrl` / `meetingProvider` を追加 (event の nested select 内)。

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/domain/events/online-format.test.ts
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/events/calendar-sync.ts __tests__/integration/
git commit -m "feat(events): writeBackMeetingUrl + calendar-sync select 拡張 (Phase B.1 task 6)"
```

---

### Task 7: google-calendar/events.ts を per-event `withMeet` に

**Files:**

- Modify: `src/shared/lib/google-calendar/events.ts`
- Modify: `src/shared/domain/settings/types.ts` (`GoogleCalendarSettingsData` から `meetEnabled` 削除)
- Modify: `src/shared/domain/settings/admin-queries.ts` (`getGoogleCalendarSettings()` から `meetEnabled` 削除)
- Test: `__tests__/unit/lib/google-calendar/events.test.ts` (既存があれば拡張、無ければ新規)

**Interfaces:**

- Consumes: 既存の `CalendarEventParams` (unchanged) + `GoogleCalendarSettingsData` (meetEnabled 削除後)
- Produces:
  - `buildEventBody(params, settings, options)` の `withMeet` を **`options.withMeet` のみで判定** (settings.meetEnabled 削除)
  - `createCalendarEvent(params, options?: { withMeet?: boolean })` 呼出 API 拡張 (backward compat: 未指定は false)

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/lib/google-calendar/events.test.ts`:

```ts
import { describe, expect, test, mock } from "bun:test";
// buildEventBody は private (module 内 function)。test するために events.ts で export に格上げする必要あり
// または createCalendarEvent の高次動作を mocked client で検証

describe("buildEventBody (Phase B.1)", () => {
  test("withMeet: false → conferenceData 出さない", () => {
    // mock settings で reminderMinutes だけ持つ (meetEnabled は既に削除)
    // buildEventBody(params, settings, { withMeet: false })
    // → result.conferenceData === undefined
  });

  test("withMeet: true → conferenceData.createRequest 出す", () => {
    // buildEventBody(params, settings, { withMeet: true })
    // → result.conferenceData.createRequest.conferenceSolutionKey.type === "hangoutsMeet"
  });

  test("settings.meetEnabled は参照しない (削除済 field)", () => {
    // settings に meetEnabled を渡さなくても動作する (型が受け付ける)
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/google-calendar/events.test.ts
```

Expected: FAIL (buildEventBody が settings.meetEnabled 参照している)

- [ ] **Step 3: 実装変更**

`src/shared/lib/google-calendar/events.ts`:

```ts
function buildEventBody(
  params: CalendarEventParams,
  settings: GoogleCalendarSettingsData,
  options: { includeAttendee?: boolean; withMeet?: boolean },
): calendar_v3.Schema$Event {
  const withMeet = options.withMeet === true && params.startTime;
  // ↑ settings.meetEnabled の AND 条件を削除
  // ... rest unchanged
}

export async function createCalendarEvent(
  params: CalendarEventParams,
  options?: { withMeet?: boolean },
): Promise<CalendarEventResult> {
  // ...
  const requestBody = buildEventBody(params, settings, {
    includeAttendee: true,
    withMeet: options?.withMeet === true, // callsite 判定
  });
  const response = await withGoogleApiRetry(() =>
    client.events.insert({
      calendarId,
      requestBody,
      sendUpdates: "none",
      ...(options?.withMeet === true ? { conferenceDataVersion: 1 } : {}),
    }),
  );
  // ...
}
```

`src/shared/domain/settings/types.ts` の `GoogleCalendarSettingsData` から `meetEnabled: boolean` 削除。
`admin-queries.ts` の `getGoogleCalendarSettings()` select / return から `meetEnabled` 削除。

- [ ] **Step 4: type-check 通過確認**

```bash
bun run type-check
```

Expected: 参照残があれば error として出る。全て修正。特に app 層で `settings.meetEnabled` を条件分岐に使っている場所を grep。

- [ ] **Step 5: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/google-calendar/events.test.ts
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/shared/lib/google-calendar/events.ts src/shared/domain/settings/*.ts __tests__/
git commit -m "refactor(gcal)!: buildEventBody を per-event withMeet 判定に、settings.meetEnabled 参照削除 (Phase B.1 task 7)"
```

---

### Task 8: outbound calendar-sync (event + reservation)

**Files:**

- Modify: `src/shared/lib/calendar-sync/outbound/` 配下の event slot sync file (event.meetingProvider === GOOGLE_MEET のとき withMeet=true、応答 hangoutLink を writeBackMeetingUrl)
- Modify: `src/shared/lib/calendar-sync/outbound/` 配下の reservation sync file (withMeet を常に false 固定 = Reservation Meet 廃止)
- Test: `__tests__/integration/lib/calendar-sync/meet-writeback.test.ts` (新規)

**Interfaces:**

- Consumes: `createCalendarEvent(params, { withMeet })` from Task 7, `writeBackMeetingUrl` from Task 6
- Produces:
  - Event slot sync 時: `event.meetingProvider === "GOOGLE_MEET"` で `withMeet: true`、応答 `data.hangoutLink` (deprecated) or `data.conferenceData.entryPoints[?type=='video'].uri` を `writeBackMeetingUrl` で保存
  - Reservation sync 時: `withMeet: false` 固定 (物理 space 予約に Meet 不要、業界標準)

- [ ] **Step 1: 該当 file を特定**

```bash
grep -rn "createCalendarEvent" src/shared/lib/calendar-sync/outbound/ src/shared/domain/events/ src/shared/domain/reservations/
```

Expected: event 用と reservation 用の呼出箇所を全部リスト化。

- [ ] **Step 2: 失敗する integration test を書く**

`__tests__/integration/lib/calendar-sync/meet-writeback.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
// mock: googleapis client の events.insert を stub して hangoutLink を返す
// Event を GOOGLE_MEET provider で作成
// outbound sync 呼出
// → Event.meetingUrl が hangoutLink 値に write-back されていることを確認

describe("Meet URL write-back (event GOOGLE_MEET)", () => {
  test("provider=GOOGLE_MEET で slot sync → hangoutLink が Event.meetingUrl に保存", async () => {
    // ...
  });

  test("provider=MANUAL で slot sync → hangoutLink が発行されない、write-back 起きない", async () => {
    // ...
  });

  test("Reservation sync → withMeet=false 固定、hangoutLink 発行されない", async () => {
    // ...
  });
});
```

- [ ] **Step 3: test 実行 → fail 確認**

```bash
bun run test:integration __tests__/integration/lib/calendar-sync/meet-writeback.test.ts
```

Expected: FAIL

- [ ] **Step 4: outbound sync 実装変更**

Event sync file (grep で特定):

```ts
const withMeet = event.meetingProvider === "GOOGLE_MEET";
const response = await createCalendarEvent(params, { withMeet });
if (withMeet && response.success) {
  const hangoutLink =
    response.event?.hangoutLink ??
    response.event?.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri ??
    null;
  if (hangoutLink) {
    await writeBackMeetingUrl({ eventId: event.id, meetingUrl: hangoutLink });
  }
}
```

`createCalendarEvent` の返却型に `event: Schema$Event` を含める拡張が必要 (現状 `eventId`, `eventUrl` のみ return)。Task 7 の signature 変更に含めるか、本 Task で拡張。

Reservation sync file:

```ts
// 現状: withMeet: settings.meetEnabled のような設定
// 変更: withMeet 引数を渡さない (default false) = Reservation Meet 廃止
await createCalendarEvent(params); // options 省略
```

- [ ] **Step 5: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/lib/calendar-sync/meet-writeback.test.ts
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/shared/lib/calendar-sync/outbound/ __tests__/integration/
git commit -m "feat(gcal)!: event GOOGLE_MEET で Meet URL 発行→write-back、Reservation Meet URL 発行を廃止 (Phase B.1 task 8)"
```

---

### Task 9: iCal buildEventCalendar URL + LOCATION

**Files:**

- Modify: `src/shared/lib/ical/types.ts` (`EventCalendarParams` に `format` / `meetingUrl` 追加)
- Modify: `src/shared/lib/ical/index.ts` (`buildEventCalendar` の event 生成部で URL + LOCATION 分岐)
- Test: `__tests__/unit/lib/ical/event-online.test.ts` (新規)

**Interfaces:**

- Consumes: `EventFormatValue`, `formatEventVenueDisplay` from Task 3
- Produces:
  - `buildEventCalendar(params)` の出力 ics で `URL:<meetingUrl>` (ONLINE/HYBRID) + `LOCATION:<primary>` を含む

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/lib/ical/event-online.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildEventCalendar } from "@/shared/lib/ical";

describe("buildEventCalendar (Phase B.1)", () => {
  test("ONLINE: LOCATION=オンライン開催、URL=meetingUrl 出力", () => {
    const cal = buildEventCalendar({
      event: {
        id: "e1",
        title: "test",
        description: "d",
        format: "ONLINE",
        meetingUrl: "https://meet.google.com/abc",
        // physical fields null
        startAt: new Date("2026-08-01T09:00:00+09:00"),
        endAt: new Date("2026-08-01T10:00:00+09:00"),
        // ...
      },
      // ...
    });
    const ics = cal.toString();
    expect(ics).toContain("LOCATION:オンライン開催");
    expect(ics).toContain("URL:https://meet.google.com/abc");
  });

  test("OFFLINE: URL 出力なし、LOCATION は物理会場", () => {
    /* ... */
  });

  test("HYBRID: LOCATION=物理会場、URL=meetingUrl 両方出力", () => {
    /* ... */
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/ical/event-online.test.ts
```

Expected: FAIL

- [ ] **Step 3: `types.ts` に field 追加、`index.ts` の buildEventCalendar を拡張**

`types.ts` の `EventCalendarParams`:

```ts
export type EventCalendarParams = {
  event: {
    // ... existing
    format: EventFormatValue;
    meetingUrl: string | null;
  };
  // ...
};
```

`index.ts`:

```ts
const { primary } = formatEventVenueDisplay(params.event);
event.location(primary ?? "");
if (params.event.meetingUrl) {
  event.url(params.event.meetingUrl); // ical-generator@11 の ICalEvent.url() API
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/ical/event-online.test.ts
```

Expected: PASS

- [ ] **Step 5: 呼出元の payload 拡張確認**

grep で `buildEventCalendar` の呼出元を洗い出し、`format` / `meetingUrl` を渡すよう修正 (event registration confirmation mail の ICS 添付経路)。

- [ ] **Step 6: commit**

```bash
git add src/shared/lib/ical/ __tests__/unit/lib/ical/
git commit -m "feat(ical): buildEventCalendar に URL + LOCATION 拡張 (RFC 5545 準拠、Phase B.1 task 9)"
```

---

### Task 10: PR 1 完了 checkpoint

**Files:** (変更なし、CI に流す)

- [ ] **Step 1: validate + build 通過確認**

```bash
bun run validate
bun run build
```

Expected: both exit 0. 失敗した場合は原因修正して再実行。

- [ ] **Step 2: 全 test suite 通過確認**

```bash
bun run test:unit
bun run test:integration
```

Expected: all PASS

- [ ] **Step 3: architecture-boundaries 通過確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: PASS

- [ ] **Step 4: PR 作成 + auto-merge 予約**

```bash
git push -u origin feat/phase-b1-online-events
gh pr create --base main --title "feat(events)!: Phase B.1 オンライン開催イベント PR 1 (schema + domain + iCal/GCal)" --body "$(cat <<'EOF'
## Summary

- Event に `format` (OFFLINE/ONLINE/HYBRID) / `meetingUrl` / `meetingProvider` (MANUAL/GOOGLE_MEET) 追加
- `Settings.googleCalendarMeetEnabled` を破壊的 DROP、per-event `meetingProvider` で完全置換
- DB CHECK 制約で ONLINE/HYBRID + MANUAL + URL 未入力 を禁止
- iCal 出力に RFC 5545 `URL` プロパティ追加、ONLINE 時 LOCATION を "オンライン開催" に
- GCal `buildEventBody` を per-event `withMeet` 判定に
- Event GOOGLE_MEET provider 時に発行された Meet URL を Event.meetingUrl に write-back
- Reservation 側の Meet URL 発行を廃止 (業界標準、Cal.com/Calendly も room 予約に Meet 自動付与せず)

Spec: docs/superpowers/specs/2026-07-16-online-events-phase-b1-design.md
Plan: docs/superpowers/plans/2026-07-16-online-events-phase-b1.md

**⚠️ breaking migration**: DROP COLUMN Settings.googleCalendarMeetEnabled を含むため、main merge 時に計画ダウンタイム 5-10 分発生。

## Test plan

- [x] unit test (enum SSoT / venue / commands / gcal buildEventBody / ical)
- [x] integration test (CHECK 制約 / meet write-back)
- [ ] 本番 deploy 後、既存 event の format=OFFLINE 初期化を確認
- [ ] 本番 deploy 後、iCal 出力の URL プロパティを 1 件手動確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 5: 次 branch (PR 2 用) 準備**

```bash
git checkout main
git pull --ff-only  # PR 1 が merge されるまで待たず、次 branch は同じ commit から派生させても OK
# PR 1 auto-merge を待つ間に PR 2 branch を切って作業開始可
git checkout -b feat/phase-b1-online-events-ui
```

---

### Task 11: Settings admin UI から googleCalendarMeetEnabled 削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/*` (該当 form component, grep で特定)
- Test: 既存 form test 修正

**Interfaces:**

- Consumes: `getGoogleCalendarSettings()` (Task 7 で meetEnabled 削除済)
- Produces: settings form から checkbox 消失、他 field 影響なし

- [ ] **Step 1: 該当 file 特定**

```bash
grep -rn "googleCalendarMeetEnabled\|meetEnabled" src/app/(admin)/
```

- [ ] **Step 2: form component から checkbox 削除**

該当 Zod schema, JSX, action 全ての `meetEnabled` 参照を削除。

- [ ] **Step 3: 既存 test 更新**

meet checkbox 前提の assertion を削除。

- [ ] **Step 4: validate + type-check**

```bash
bun run validate
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/settings/ __tests__/
git commit -m "feat(admin)!: settings 画面から googleCalendarMeetEnabled 入力欄削除 (Phase B.1 task 11)"
```

---

### Task 12: EventLocationSpaceSelector 開催形態 ToggleGroup + OnlineMeetingFields

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector.tsx`
- Test: `__tests__/unit/app/admin/events/EventLocationSpaceSelector.test.tsx` (既存があれば拡張、無ければ新規、React Testing Library)

**Interfaces:**

- Consumes: `EVENT_FORMAT` / `MEETING_PROVIDER` from Task 2
- Produces: form field `format` / `meetingUrl` / `meetingProvider` を conform useForm 経由で expose

- [ ] **Step 1: 失敗する test を書く (a11y 含む)**

```tsx
test("開催形態 ToggleGroup を表示、default = OFFLINE", () => {
  /* ... */
});
test("ONLINE 選択で OnlineMeetingFields (provider RadioGroup + URL Input) 表示", () => {
  /* ... */
});
test("HYBRID 選択で physical + online 両方の field 表示", () => {
  /* ... */
});
test("MANUAL provider 選択時 URL Input が required", () => {
  /* ... */
});
test("GOOGLE_MEET provider 選択時 URL Input 非表示、alert 表示", () => {
  /* ... */
});
```

- [ ] **Step 2: fail 確認 → 実装 → pass 確認**

spec §8.1 の JSX 参考:

```tsx
<ToggleGroup type="single" value={format} onValueChange={setFormat}>
  <ToggleGroupItem value="OFFLINE">会場のみ</ToggleGroupItem>
  <ToggleGroupItem value="ONLINE">オンラインのみ</ToggleGroupItem>
  <ToggleGroupItem value="HYBRID">ハイブリッド</ToggleGroupItem>
</ToggleGroup>;

{
  format === "OFFLINE" && <PhysicalVenueFields />;
}
{
  format === "ONLINE" && <OnlineMeetingFields />;
}
{
  format === "HYBRID" && (
    <>
      <PhysicalVenueFields />
      <OnlineMeetingFields />
    </>
  );
}
```

`OnlineMeetingFields`:

```tsx
<RadioGroup value={meetingProvider} onValueChange={setMeetingProvider}>
  <RadioGroupItem value="MANUAL">
    手入力 (Zoom / Teams / 独自 URL)
  </RadioGroupItem>
  <RadioGroupItem value="GOOGLE_MEET">Google Meet で自動作成</RadioGroupItem>
</RadioGroup>;
{
  meetingProvider === "MANUAL" && (
    <Input
      type="url"
      name="meetingUrl"
      placeholder="https://..."
      required
      pattern="https://.*"
    />
  );
}
{
  meetingProvider === "GOOGLE_MEET" && (
    <Alert>公開時に Google Meet URL が自動発行されます</Alert>
  );
}
```

- [ ] **Step 3: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/events/ __tests__/
git commit -m "feat(admin): EventLocationSpaceSelector に開催形態 ToggleGroup + OnlineMeetingFields (Phase B.1 task 12)"
```

---

### Task 13: EventForm に meetingUrl / meetingProvider field 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts` (conform Zod)
- Test: 既存 EventForm test 拡張

**Interfaces:**

- Consumes: Task 12 の `EventLocationSpaceSelector`, Task 4 の `eventInputSchema`
- Produces: form submit に 3 field が含まれ、action 側で create/updateEventCommand に渡る

- [ ] **Step 1-4: TDD (form schema + submit → action → prisma reflect の chain 検証)**

- [ ] **Step 5: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/events/
git commit -m "feat(admin): EventForm で format/meetingUrl/meetingProvider を submit (Phase B.1 task 13)"
```

---

### Task 14: public event detail page 会場表示 + 「URL はメールで」ラベル

**Files:**

- Modify: `src/app/(public)/events/[slug]/page.tsx`

**Interfaces:**

- Consumes: `formatEventVenueDisplay` / `isEventVirtualAccessible` from Task 3
- Produces: public event detail の会場 section が 3 format 対応

- [ ] **Step 1: 該当 JSX を編集**

```tsx
const { primary, secondary } = formatEventVenueDisplay(event);
{
  primary && <div>{primary}</div>;
}
{
  secondary && <div className="text-sm text-muted-foreground">{secondary}</div>;
}

{
  isEventVirtualAccessible(event) && (
    <p className="text-sm text-muted-foreground">
      参加 URL は登録完了時にメールでお送りします
    </p>
  );
}
```

**重要**: `event.meetingUrl` は destructure しない。公開 JSX に render しないこと (business rule: 登録完了者のみ開示)。

- [ ] **Step 2: dev server で目視確認**

```bash
# ローカルで admin から ONLINE event を作って /events/<slug> にアクセス
# → 「オンライン開催」バッジ表示、「参加 URL は登録完了時に...」ラベル表示、URL 自体は表示なし
```

- [ ] **Step 3: commit**

```bash
git add src/app/(public)/events/
git commit -m "feat(public): event detail 会場表示を 3 format 対応 + URL 開示ポリシー (Phase B.1 task 14)"
```

---

### Task 15: EventJsonLd 3値化 + schema.org VirtualLocation array

**Files:**

- Modify: `src/app/(public)/events/[slug]/*` (JSON-LD 生成箇所、既存 EventJsonLd component または inline)
- Test: `__tests__/unit/app/public/events/event-json-ld.test.ts` (新規、JSON-LD 出力の shape 検証)

**Interfaces:**

- Consumes: `EVENT_FORMAT_TO_SCHEMA_ORG` / `isEventVirtualAccessible` from Task 2, 3
- Produces: `EventJsonLd({ event })` の出力 JSON で:
  - `eventAttendanceMode: <3 値>`
  - `location: Place | VirtualLocation | [Place, VirtualLocation]`
  - **`location.VirtualLocation.url` は出力しない** (登録者限定、Meetup 同様)

- [ ] **Step 1: 失敗する test を書く**

```ts
describe("EventJsonLd (Phase B.1)", () => {
  test("OFFLINE: eventAttendanceMode = OfflineEventAttendanceMode、location = Place", () => {
    /* ... */
  });
  test("ONLINE: eventAttendanceMode = OnlineEventAttendanceMode、location = VirtualLocation (url なし)", () => {
    /* ... */
  });
  test("HYBRID: eventAttendanceMode = MixedEventAttendanceMode、location = [Place, VirtualLocation]", () => {
    /* ... */
  });
  test("公開 JSON-LD に meetingUrl は含まれない (全 format)", () => {
    /* ... */
  });
});
```

- [ ] **Step 2: fail 確認 → 実装 → pass 確認**

`EventJsonLd` の JSON 生成 logic:

```tsx
const attendanceMode = EVENT_FORMAT_TO_SCHEMA_ORG[event.format];
const physicalLocation = /* 既存 Place 生成 (name, address, ...) */;
const virtualLocation = isEventVirtualAccessible(event)
  ? { "@type": "VirtualLocation", name: "オンライン開催 (登録完了時に URL をお送りします)" }
  : null;

const location = (() => {
  switch (event.format) {
    case "OFFLINE": return physicalLocation;
    case "ONLINE": return virtualLocation;
    case "HYBRID": return [physicalLocation, virtualLocation].filter(Boolean);
  }
})();

const json = {
  "@context": "https://schema.org",
  "@type": "Event",
  eventAttendanceMode: attendanceMode,
  location,
  // ... existing fields
};
```

- [ ] **Step 3: Google Rich Results Test で手動検証 (task 20 の pre-check)**

```bash
# ローカルで /events/<online-slug> を開き、view-source → JSON-LD script 抽出
# https://search.google.com/test/rich-results に貼り付け
# → "Event" として認識、eventAttendanceMode / VirtualLocation が拾われる
```

- [ ] **Step 4: commit**

```bash
git add src/app/(public)/events/ __tests__/
git commit -m "feat(public): EventJsonLd を 3 format + polymorphic location array 対応 (Phase B.1 task 15)"
```

---

### Task 16: EventRegistrationConfirmation email URL section

**Files:**

- Modify: `src/shared/email/templates/EventRegistrationConfirmation/index.tsx`
- Modify: `src/shared/email/templates/EventRegistrationConfirmation/fixture.ts` (新 fixture 追加)
- Test: `__tests__/unit/email/EventRegistrationConfirmation.test.ts` (既存 test file を拡張)

**Interfaces:**

- Consumes: `isEventVirtualAccessible` from Task 3
- Produces: メール template が `event.format` / `event.meetingUrl` を受け取り、ONLINE/HYBRID 時に URL section をレンダ

- [ ] **Step 1: 失敗する test を書く**

```ts
describe("EventRegistrationConfirmation (Phase B.1)", () => {
  test("ONLINE + meetingUrl 指定 → URL section render", async () => {
    const html = await renderEmail({
      event: {
        format: "ONLINE",
        meetingUrl: "https://meet.google.com/x",
      } /* ... */,
    });
    expect(html).toContain("オンライン参加 URL");
    expect(html).toContain("https://meet.google.com/x");
  });

  test("OFFLINE → URL section 非表示", async () => {
    /* ... */
  });

  test("HYBRID + meetingUrl → URL section render (物理会場情報と併記)", async () => {
    /* ... */
  });

  test("ONLINE + meetingUrl null (write-back 未反映) → URL section に '準備中' 表示", async () => {
    /* ... */
  });
});
```

- [ ] **Step 2: fail 確認 → 実装 → pass 確認**

Template に section 追加:

```tsx
{
  isEventVirtualAccessible(event) && (
    <Section>
      <Heading as="h3">オンライン参加 URL</Heading>
      {event.meetingUrl ? (
        <>
          <Link href={event.meetingUrl}>{event.meetingUrl}</Link>
          <Text>開始時刻の 5 分前に上記 URL からご参加ください</Text>
        </>
      ) : (
        <Text>URL は開催が近づき次第、別途お知らせします</Text>
      )}
    </Section>
  );
}
```

fixture に `format: "ONLINE"` + `meetingUrl: "https://meet.google.com/example"` の preview 追加。

- [ ] **Step 3: `bun run email:dev` で目視確認**

```bash
bun run email:dev
# → http://localhost:3001 で ONLINE fixture プレビュー
```

- [ ] **Step 4: commit**

```bash
git add src/shared/email/templates/EventRegistrationConfirmation/ __tests__/unit/email/
git commit -m "feat(email): EventRegistrationConfirmation に ONLINE/HYBRID 時 URL section (Phase B.1 task 16)"
```

---

### Task 17: mypage event detail で meetingUrl 表示

**Files:**

- Modify: `src/app/(public)/mypage/events/[registrationId]/*` (customer login 経路)
- Modify: guest claim mypage 経路 (`src/app/(public)/mypage/events/claim/*` など、grep で特定)

**Interfaces:**

- Consumes: `getRegistrationDetailForCustomer` / `getRegistrationByToken` from Task 5 (返却型に meetingUrl 含む)
- Produces: 登録済ユーザー / claim token 保持者に対して event detail に meetingUrl を表示

- [ ] **Step 1: 該当 file 特定**

```bash
grep -rn "mypage/events\|getRegistrationDetail\|getRegistrationByToken" src/app/(public)/
```

- [ ] **Step 2: 会場 section に meetingUrl 追加**

customer / guest 経路の event detail JSX で:

```tsx
{
  isEventVirtualAccessible(event) && event.meetingUrl && (
    <div>
      <h4>参加 URL</h4>
      <a href={event.meetingUrl}>{event.meetingUrl}</a>
    </div>
  );
}
```

- [ ] **Step 3: E2E で customer login → event detail → meetingUrl 表示確認**

- [ ] **Step 4: commit**

```bash
git add src/app/(public)/mypage/
git commit -m "feat(public): mypage event detail に meetingUrl 表示 (登録済ユーザー限定、Phase B.1 task 17)"
```

---

### Task 18: E2E - admin online create → public 表示 → JSON-LD 検証

**Files:**

- Create: `e2e/tests/admin-authenticated/events-create-online.spec.ts`

**Interfaces:**

- Consumes: e2e helper (admin storageState、event factory)
- Produces: golden path E2E (admin create ONLINE + MANUAL + URL → 公開 → 公開ページに JSON-LD 出力確認 + URL 非表示確認)

- [ ] **Step 1: E2E spec を書く**

```ts
import { test, expect } from "@playwright/test";

test.describe("Phase B.1: online event admin flow", () => {
  test("admin が ONLINE + MANUAL + URL で event 作成 → 公開ページに JSON-LD 出力、URL は非表示", async ({
    page,
  }) => {
    await page.goto("/admin/events/new");
    // format toggle ONLINE
    // provider MANUAL
    // URL: https://meet.google.com/e2e-test
    // タイトル、日時、submit
    // → /admin/events/<id> 表示

    // 公開
    // → 公開ページ /events/<slug> にアクセス

    // 会場 section の primary text = "オンライン開催"
    await expect(page.getByText("オンライン開催")).toBeVisible();
    // 「参加 URL は登録完了時に...」ラベル表示
    await expect(
      page.getByText("参加 URL は登録完了時にメールでお送りします"),
    ).toBeVisible();
    // URL 本体は非表示 (accessible text にも含まれない)
    await expect(
      page.getByText("https://meet.google.com/e2e-test"),
    ).not.toBeVisible();

    // JSON-LD script 抽出
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const parsed = JSON.parse(jsonLd!);
    expect(parsed.eventAttendanceMode).toBe("OnlineEventAttendanceMode");
    expect(parsed.location["@type"]).toBe("VirtualLocation");
    expect(parsed.location.url).toBeUndefined(); // URL は JSON-LD にも含めない (業界標準)
  });
});
```

- [ ] **Step 2: E2E 実行**

```bash
bunx playwright test --project=chromium-authenticated e2e/tests/admin-authenticated/events-create-online.spec.ts
```

Expected: PASS

- [ ] **Step 3: commit**

```bash
git add e2e/tests/admin-authenticated/
git commit -m "test(e2e): admin online event 作成 → 公開ページ JSON-LD + URL 非表示検証 (Phase B.1 task 18)"
```

---

### Task 19: architecture-boundaries test - meetingUrl leak gate

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts`

**Interfaces:**

- Produces: 公開ページ配下で `event.meetingUrl` を JSX render する箇所ゼロを grep gate

- [ ] **Step 1: gate を追加**

`architecture-boundaries.test.ts` に describe 追加:

```ts
describe("Phase B.1: public JSX で event.meetingUrl を render しない", () => {
  test("src/app/(public)/events/[slug]/ で event.meetingUrl の JSX 参照ゼロ", async () => {
    const files = await glob("src/app/(public)/events/[slug]/**/*.tsx");
    for (const file of files) {
      const content = await readFile(file, "utf8");
      // JSX 内で {event.meetingUrl} や {meetingUrl} を直接 render している行を検出
      // マイページ (mypage/events/[registrationId]) は許可 (登録者限定なので render OK)
      const forbiddenPatterns = [
        /\{event\.meetingUrl\}/,
        /\{meetingUrl\}/, // destructure された変数の直接 render
      ];
      for (const pattern of forbiddenPatterns) {
        expect(
          content,
          `${file}: 公開ページで meetingUrl を JSX render するのは禁止 (登録完了者のみ開示)`,
        ).not.toMatch(pattern);
      }
    }
  });
});
```

- [ ] **Step 2: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: PASS (Task 14 で正しく destructure 回避していれば)

- [ ] **Step 3: commit**

```bash
git add __tests__/unit/architecture-boundaries.test.ts
git commit -m "test(arch): 公開ページで event.meetingUrl を render しない gate 追加 (Phase B.1 task 19)"
```

---

### Task 20: PR 2 完了 checkpoint

**Files:** (変更なし、CI に流す)

- [ ] **Step 1: validate + build 通過確認**

```bash
bun run validate
bun run build
```

- [ ] **Step 2: 全 test suite 通過**

```bash
bun run test:unit
bun run test:integration
bunx playwright test --project=chromium-smoke
```

- [ ] **Step 3: PR 作成 + auto-merge 予約**

```bash
git push -u origin feat/phase-b1-online-events-ui
gh pr create --base main --title "feat(events): Phase B.1 オンライン開催イベント PR 2 (admin UI + JSON-LD + email + mypage + E2E)" --body "$(cat <<'EOF'
## Summary

- admin: EventLocationSpaceSelector に「開催形態」ToggleGroup + OnlineMeetingFields (MANUAL / GOOGLE_MEET)
- admin: Settings 画面から googleCalendarMeetEnabled 入力欄削除
- public: event detail に 3 format 対応の会場表示 + 「URL は登録完了メールで」ラベル (Eventbrite/Meetup 標準)
- public: EventJsonLd を schema.org 3 値 + polymorphic location array に対応 (VirtualLocation の url は非公開)
- email: EventRegistrationConfirmation に ONLINE/HYBRID 時の URL section
- mypage: 登録済ユーザー向け event detail で meetingUrl 表示
- E2E: admin online create → public 表示 → JSON-LD 検証
- architecture-boundaries: 公開ページ配下で event.meetingUrl 直接 render を禁止する gate

Spec: docs/superpowers/specs/2026-07-16-online-events-phase-b1-design.md
Plan: docs/superpowers/plans/2026-07-16-online-events-phase-b1.md

依存: PR 1 (#TBD) の merge を前提。

## Test plan

- [x] unit test (JSON-LD / email / architecture-boundaries)
- [x] E2E (admin create ONLINE → public JSON-LD 検証)
- [ ] 本番 deploy 後、Google Search Console の Event 拡張レポート監視 (2-3 日)
- [ ] 本番で ONLINE event を 1 件作成 → 登録完了メール受信 → URL 差込確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 4: 完了報告**

user に「PR 1 (#XXXX) と PR 2 (#YYYY) が auto-merge queue 予約済み。Phase B.1 の実装作業は完了、CI 通過 + merge を確認したら次タスク (Phase B.2 = RRULE) の brainstorming に進む」と report。

---

## Self-Review

**1. Spec coverage:**

- Goal 1 (開催形態 3 値): Task 1, 3, 12, 14, 15 でカバー
- Goal 2 (Meet URL 手入力 / 自動発行 per-event opt-in): Task 8, 12
- Goal 3 (参加 URL 開示 = 登録完了者のみ): Task 14, 16, 17, 19
- Goal 4 (schema.org JSON-LD 3 値 + polymorphic location): Task 15
- Goal 5 (iCal RFC 5545 URL + LOCATION): Task 9
- Goal 6 (GCal per-event conferenceData + write-back): Task 7, 8
- Goal 7 (Settings.googleCalendarMeetEnabled DROP): Task 1, 7, 11
- Goal 8 (DB CHECK 制約): Task 1
- Goal 9 (Reservation 側 Meet 廃止): Task 8

全 goal に対応 task あり。gap なし。

**2. Placeholder scan:**

- Task 12 / 13 の "Step 1-4: TDD" は step 展開が省略されている。Task 3 / 4 と同じ pattern (test 書く → fail → 実装 → pass → commit) で埋める。実行者は Task 3 / 4 を参考にする。
- Task 4 の test に `TODO` block あり (「TODO を具体的な expect 付き test に埋める」)。これは実行者が Zod schema と format × provider × URL の全組合せ表を見て埋める意図で、intentional。README に相当。
- Task 8 の Step 1 "該当 file を特定" は grep コマンドを明示、実行者は結果 file を判断可能。

**3. Type consistency:**

- `EventFormatValue` / `MeetingProviderValue` は Task 2 で export、Task 3 / 4 / 9 で consume。名前一致。
- `writeBackMeetingUrl({ eventId, meetingUrl })` は Task 6 で定義、Task 8 で consume。signature 一致。
- `formatEventVenueDisplay` / `isEventVirtualAccessible` は Task 3 で定義、Task 9 / 14 / 15 / 16 で consume。signature 一致。
- `EVENT_FORMAT_TO_SCHEMA_ORG` は Task 2 で定義、Task 15 で consume。

placeholder / consistency 双方 OK。
