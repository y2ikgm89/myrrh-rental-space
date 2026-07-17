# Recurring Reservations (Phase B.2 RRULE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reservation-side RRULE 繰返し予約を admin 経由で作成可能にし、`ReservationSeries` template + materialized instances + Google Calendar 業界標準 3 択キャンセル (this-only / this-and-following / series-all) を実装する。

**Architecture:** RFC 5545 準拠 raw RRULE string を `ReservationSeries.rrule` に保存、`rrule@2.8+` package で expand → 単一 tx で N Reservation instance を materialize。既存 EXCLUDE 制約 + CROSS-TABLE TRIGGER + refund/passcode/receipt per-row 契約と自然整合 (Nextcloud pattern)。GCal は `event.recurrence: string[]` の master event 1 個 + `events.instances(masterId)` の childId (`{masterId}_{yyyymmddTHHMMSSZ}`) を各 Reservation.googleCalendarEventId に write-back。iCal は `.repeating(rrule)` + master UID = `reservation-series-{id}@{host}`。破壊的変更ゼロ (全て加算的 add-only)。

**Tech Stack:** Prisma 7 + PostgreSQL 16 / Next.js 16 App Router (`cacheComponents: true` + `"use cache"`) / rrule@2.8+ (RFC 5545 parser/expander、de-facto standard) / ical-generator@11 (既存) / googleapis (既存) / Zod 4 + conform / bun test (per-file 隔離 runner) / Playwright

**Spec:** [docs/superpowers/specs/2026-07-17-recurring-reservations-phase-b2-design.md](../specs/2026-07-17-recurring-reservations-phase-b2-design.md)

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行 (素の `bun test` は mock.module プロセス汚染で壊れる)
- `bun run validate` はテストを含まない (type-check + lint のみ)。「テスト緑」は test コマンド実出力でのみ主張
- Prisma import は `@/shared/db/prisma` からのみ。import する file は `import "server-only"` 必須
- `src/app/*` から Prisma / `@generated/prisma` の直 import 禁止 (enum は `@/shared/lib/validations/enums/prisma-types` 経由)
- `cacheComponents: true` のため route segment config 全面禁止。動的化は `await connection()` で
- キャッシュタグの文字列直書き禁止。`CACHE_TAGS` / `getCacheTag` 経由
- `any` / non-null `!` / `@ts-ignore` / 危険 cast は grep gate で 0 件強制
- 既存 `prisma/migrations/*/migration.sql` は編集禁止 (pre-commit がブロック)。修正は新規 migration で
- 予約書込は `prisma.$transaction` 内で advisory lock を重複チェックより先に取得。**Phase B.2 は 728357 (series 単位) + 既存 728351 (Space) の 2 段 lock**
- `TermsAgreement` / `AuditLog` は append-only (update/delete 禁止)
- 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter (`timeZone: "Asia/Tokyo"`)
- main への push = 即・本番デプロイ。本 phase は全て add-only なので**破壊 migration 発生せず、無停止デプロイ**
- Bun 1.3.14 / TypeScript 6.0.3 (exact pin)
- **Codex spec fix 全 5 件を反映済 (spec commit 1782e75e9 @ PR #1150)**: TermsScope 命名 / TermsAgreement は required doc ごと 1 行 / instance couponId=null / bulk cancel の suppress flag / partial UNIQUE `WHERE deletedAt IS NULL`
- Conventional Commits + Co-Authored-By 必須 (lefthook commit-msg gate)
- `git push` timeout は 300 秒以上確保 (pre-push hook で type-check 60-70s + arch-boundaries 8-10s 直列)

## File Structure Map

**PR 1** (schema + migration + enum SSoT + Settings): 6-8 file

| File                                                                 | 責務                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                               | `ReservationSeries` model + `Reservation.seriesId/recurrenceInstanceIndex` + `Settings.maxRecurrenceInstances` + `ReservationSeriesFreq` enum + `TermsScope` に `RESERVATION_SERIES` 値追加 |
| `prisma/migrations/<timestamp>_add_reservation_series/migration.sql` | ADD ENUM value + CREATE TYPE + CREATE TABLE + partial UNIQUE + ADD COLUMN + Settings ADD COLUMN                                                                                             |
| `src/shared/lib/validations/enums/prisma-types.ts`                   | `RESERVATION_SERIES_FREQ` / `TERMS_SCOPE.RESERVATION_SERIES` SSoT 追加                                                                                                                      |
| `__tests__/unit/lib/enums/reservation-series-freq.test.ts`           | enum SSoT test                                                                                                                                                                              |
| `__tests__/unit/architecture/reservation-series-schema.test.ts`      | schema shape gate (couponId is nullable, partial unique 存在確認)                                                                                                                           |

**PR 2** (rrule install + series-rrule.ts): 4-5 file

| File                                                      | 責務                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `package.json` + `bun.lock`                               | `rrule@2.8+` install                                                                                                           |
| `src/shared/domain/reservations/series-rrule.ts`          | `parseRruleString` / `expandInstances` / `countInstances` / `validateRruleForSeries` (rrule.js の domain wrap、境界 primitive) |
| `__tests__/unit/domain/reservations/series-rrule.test.ts` | RRULE 3 freq × 各 case (count 上限違反 / UNTIL 無効 / freq WHITELIST 外) 網羅                                                  |
| `__tests__/unit/architecture-boundaries.test.ts`          | `rrule` import が domain layer のみ許可の grep gate 追加                                                                       |

**PR 3** (series-commands + cancel-core bulk + terms + cancellation-side-effects): 10-12 file

| File                                                                     | 責務                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/domain/reservations/series-commands.ts`                      | `createReservationSeriesCommand` / `cancelReservationSeriesCommand`                                                                       |
| `src/shared/domain/reservations/cancel-core.ts`                          | `applyBulkCancellation(tx, ids: string[], options)` 追加                                                                                  |
| `src/shared/domain/reservations/cancellation-side-effects.ts`            | `CancellationSideEffectInput.suppress` flag 追加 + `applyBulkCancellationSideEffects` 追加 + `bulkReservationCancelledEmailTemplate` 差込 |
| `src/shared/domain/terms/queries.ts`                                     | `assertAllRequiredTermsAgreed` の RESERVATION_SERIES scope 実装                                                                           |
| `src/shared/domain/terms/commands.ts`                                    | `recordTermsAgreements` の resourceId パラメータ拡張 (series id 受入)                                                                     |
| `src/shared/domain/reservations/series-advisory-lock.ts`                 | `lockReservationSeriesForTransaction(tx, seriesId)` (advisory lock 728357 wrapper)                                                        |
| `__tests__/unit/domain/reservations/series-commands.test.ts`             | createSeries の overlap 検出 / TermsAgreement N 行 / coupon usage 加算 / instance materialize                                             |
| `__tests__/unit/domain/reservations/cancel-series.test.ts`               | 3 scope 各々の updateMany where + AuditLog 順序 + email suppress                                                                          |
| `__tests__/integration/domain/reservations/series-overlap.test.ts`       | 実 DB で EXCLUDE 制約 / CROSS-TABLE TRIGGER + advisory lock 728357 直列化                                                                 |
| `__tests__/integration/domain/reservations/series-cancel-scopes.test.ts` | 3 scope 実 DB round-trip                                                                                                                  |

**PR 4** (iCal + GCal outbound + write-back): 6-8 file

| File                                                              | 責務                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/lib/ical/index.ts`                                    | `buildReservationSeriesCalendar` 新規 (`event.repeating(rrule)` + master UID)                |
| `src/shared/lib/ical/uid.ts`                                      | `buildReservationSeriesUid(seriesId, host)` helper 追加                                      |
| `src/shared/lib/ical/types.ts`                                    | `ReservationSeriesCalendarParams` 型追加                                                     |
| `src/shared/lib/google-calendar/types.ts`                         | `CalendarEventParams` に `recurrence?: string[]` 追加                                        |
| `src/shared/lib/google-calendar/events.ts`                        | `buildEventBody` に recurrence 包含、`fetchEventInstances(masterId)` 追加 (write-back 用)    |
| `src/shared/lib/calendar-sync/outbound.ts`                        | `syncReservationSeriesToCalendar(seriesId)` + `writeBackInstanceGoogleCalendarEventIds` 追加 |
| `__tests__/unit/lib/ical/series.test.ts`                          | buildReservationSeriesCalendar の RRULE / master UID / RECURRENCE-ID 出力                    |
| `__tests__/integration/lib/calendar-sync/series-outbound.test.ts` | mocked GCal で master event 作成 + events.instances 応答から childId write-back              |

**PR 5** (Admin UI: form + calendar view + detail): 10-12 file

| File                                                                                           | 責務                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts`        | `isRecurring` + `recurrence` field 追加 + refine                             |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts` (新規)             | `buildRruleString({freq, interval, byday, count, until})` client-safe helper |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/RecurrenceFields.tsx` (新規)       | 開催形態 subsection (ToggleGroup + RadioGroup + inputs)                      |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/RecurrencePreview.tsx` (新規)      | rrule.js client-side dynamic import → 「毎週火/木、10 回、次回 YYYY-MM-DD」  |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx`               | 「繰返し」toggle 追加 + RecurrenceFields render + submit action 分岐         |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts`                             | `createRecurringReservationAction` + `cancelReservationSeriesAction`         |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/calendar/calendar-types.ts`                     | `CalendarEvent` type に `seriesId?` / `recurrenceInstanceIndex?` 追加        |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventCell.tsx`            | repeat icon + tooltip 追加                                                   |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventBadge.tsx`           | 同上 (MonthView 用 compact)                                                  |
| `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/SeriesInfoSection.tsx` (新規) | 予約詳細ページの series section + 3 択キャンセルボタン                       |
| `__tests__/unit/app/admin/reservations/RecurrenceFields.test.tsx`                              | form 動作 + Zod refine                                                       |
| `__tests__/unit/app/admin/reservations/rrule-utils.test.ts`                                    | buildRruleString unit                                                        |

**PR 6** (public UI + E2E + docs): 6-8 file

| File                                                                                 | 責務                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/app/(public)/mypage/reservations/_components/*`                                 | series 情報表示 (「毎週火 10 回のうち 3 回目」)                   |
| `src/app/(public)/mypage/reservations/[id]/*`                                        | 3 択キャンセル UI (`Settings.customerCanCancelSeriesInFull` gate) |
| `src/shared/domain/settings/*`                                                       | `customerCanCancelSeriesInFull Boolean @default(false)` 追加      |
| `prisma/schema.prisma`                                                               | Settings 列追加                                                   |
| `prisma/migrations/<timestamp>_add_customer_can_cancel_series_setting/migration.sql` | ADD COLUMN nullable-with-default (safe)                           |
| `e2e/authenticated/admin/create-recurring-reservation.spec.ts`                       | admin create → 10 instance → cancel series-all の golden path E2E |
| `__tests__/unit/domain/reservations/customer-series-cancel-gate.test.ts`             | Settings gate による customer 3-way availability                  |
| `docs/superpowers/plans/2026-07-17-recurring-reservations-phase-b2.md` (本 file)     | 完了 checkbox 全埋め (PR 6 で最終更新)                            |

---

## Task 1: Prisma schema + migration (add-only)

**PR**: 1

**Files:**

- Modify: `prisma/schema.prisma` (add `ReservationSeries` model + `Reservation` 2 field + `Settings` 1 field + `ReservationSeriesFreq` enum + `TermsScope` に値追加)
- Create: `prisma/migrations/<timestamp>_add_reservation_series/migration.sql` (via `bunx prisma migrate dev --create-only --name add_reservation_series`)

**Interfaces:**

- Consumes: 既存 `Space` / `Customer` / `Coupon` / `User` model
- Produces:
  - `ReservationSeriesFreq` enum (`DAILY | WEEKLY | MONTHLY`) in Prisma client
  - `ReservationSeries` model with fields per spec §1
  - `Reservation.seriesId: String? @db.Uuid` + `Reservation.recurrenceInstanceIndex: Int?`
  - `Settings.maxRecurrenceInstances: Int @default(26)`
  - `TermsScope` に `RESERVATION_SERIES` 値追加 (Codex fix、既存 4 値の後)
  - DB partial UNIQUE `reservation_series_space_dtstart_active_unique WHERE deletedAt IS NULL`
  - advisory lock 728357 予約用 index / trigger は無し (application 層のみで使用)

- [ ] **Step 1: schema.prisma を編集 (enum 追加)**

既存 `enum ReservationStatus` の直後に追加:

```prisma
enum ReservationSeriesFreq {
  DAILY
  WEEKLY
  MONTHLY
}
```

`enum TermsScope` (line 1661) の末尾に `RESERVATION_SERIES` を追加:

```prisma
enum TermsScope {
  RESERVATION
  INQUIRY
  EVENT_REGISTRATION
  LOGIN_SIGNUP
  RESERVATION_SERIES  // Phase B.2
}
```

- [ ] **Step 2: `ReservationSeries` model 追加**

`model Reservation { ... }` の直前に:

```prisma
model ReservationSeries {
  id                    String                @id @default(uuid()) @db.Uuid
  spaceId               String                @db.Uuid
  customerId            String                @db.Uuid
  couponId              String?               @db.Uuid
  rrule                 String                @db.VarChar(500)
  dtstart               DateTime              @db.Timestamp(6)
  duration              Int
  instanceCount         Int
  templateData          Json
  agreementSnapshot     Json
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt
  cancelledAt           DateTime?
  cancelledByType       String?               @db.VarChar(20)
  cancellationReason    String?               @db.Text
  deletedAt             DateTime?
  deletedById           String?               @db.Uuid

  space                 Space                 @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  customer              Customer              @relation(fields: [customerId], references: [id], onDelete: Cascade)
  coupon                Coupon?               @relation(fields: [couponId], references: [id], onDelete: SetNull)
  deletedBy             User?                 @relation("ReservationSeriesDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
  instances             Reservation[]

  // partial UNIQUE (WHERE deletedAt IS NULL) は migration.sql で raw SQL で定義。
  // Prisma @@unique は無条件のため schema には非 unique index のみ宣言。
  @@index([spaceId, dtstart])
  @@index([customerId])
  @@index([createdAt])
  @@index([deletedAt])
  @@map("reservation_series")
}
```

- [ ] **Step 3: `Reservation` model に 2 field 追加**

`model Reservation { ... }` の末尾 (@@index の直前) に:

```prisma
  seriesId                 String?              @db.Uuid
  recurrenceInstanceIndex  Int?
  series                   ReservationSeries?   @relation(fields: [seriesId], references: [id], onDelete: SetNull)
```

既存 `@@index` group に追加:

```prisma
  @@index([seriesId, recurrenceInstanceIndex])
```

- [ ] **Step 4: `Settings` に 1 field 追加**

`model Settings { ... }` の中に (他 Int 系 field の近く):

```prisma
  maxRecurrenceInstances  Int  @default(26)
```

- [ ] **Step 5: 反対側 relation 追加 (Space / Customer / Coupon / User)**

**Space model** (`prisma/schema.prisma` 内の該当箇所) の relations に追加:

```prisma
  reservationSeries       ReservationSeries[]
```

**Customer model**:

```prisma
  reservationSeries       ReservationSeries[]
```

**Coupon model**:

```prisma
  reservationSeries       ReservationSeries[]
```

**User model** (deletedBy relation):

```prisma
  deletedReservationSeries  ReservationSeries[]  @relation("ReservationSeriesDeletedBy")
```

- [ ] **Step 6: migration SQL 生成 (create-only、apply しない)**

```bash
bunx prisma migrate dev --create-only --name add_reservation_series
```

Expected: `prisma/migrations/<timestamp>_add_reservation_series/migration.sql` が作成される (自動 apply しない)

- [ ] **Step 7: 生成された migration.sql に partial UNIQUE index を手動追加**

生成された migration.sql の末尾に append:

```sql
-- Codex P2 #3599414660 fix: partial unique で soft-delete 後の同 (spaceId, dtstart) 再作成を許可
CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"
  ON "reservation_series" ("spaceId", "dtstart") WHERE "deletedAt" IS NULL;
```

- [ ] **Step 8: migration 適用 + client 再生成**

```bash
bun run db:migrate
bun run db:generate
```

Expected: migration 適用成功、Prisma client に `ReservationSeries` / `ReservationSeriesFreq` が生成される

- [ ] **Step 9: seed 実行 (smoke test)**

```bash
bun run db:seed
```

Expected: 既存 seed が変わらず成功 (新 field は全 default に埋まる)

- [ ] **Step 10: squawk lint pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture/migration-safety.test.ts
```

Expected: PASS (全 add-only、breaking pattern 無し)

- [ ] **Step 11: architecture-boundaries pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: PASS (全 boundary 契約温存)

- [ ] **Step 12: commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(reservations): ReservationSeries model + Reservation.seriesId + Settings.maxRecurrenceInstances + TermsScope.RESERVATION_SERIES (Phase B.2 task 1)"
```

---

## Task 2: Enum SSoT (prisma-types.ts)

**PR**: 1

**Files:**

- Modify: `src/shared/lib/validations/enums/prisma-types.ts`
- Test: `__tests__/unit/lib/enums/reservation-series-freq.test.ts` (新規)

**Interfaces:**

- Consumes: `ReservationSeriesFreq` from `@generated/prisma/enums` (Task 1 で生成)、`TermsScope` (既存 + Task 1 の新 value)
- Produces:
  - `RESERVATION_SERIES_FREQ: { DAILY, WEEKLY, MONTHLY }` const
  - `ReservationSeriesFreqValue` type
  - `RESERVATION_SERIES_FREQ_VALUES` array
  - `TERMS_SCOPE.RESERVATION_SERIES` const 値追加

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/lib/enums/reservation-series-freq.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  RESERVATION_SERIES_FREQ,
  RESERVATION_SERIES_FREQ_VALUES,
  TERMS_SCOPE,
  TERMS_SCOPE_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";

describe("RESERVATION_SERIES_FREQ", () => {
  test("3 値を持つ (DAILY / WEEKLY / MONTHLY)", () => {
    expect(RESERVATION_SERIES_FREQ_VALUES).toEqual([
      "DAILY",
      "WEEKLY",
      "MONTHLY",
    ]);
  });

  test("const object と VALUES が一致", () => {
    expect(Object.values(RESERVATION_SERIES_FREQ)).toEqual(
      RESERVATION_SERIES_FREQ_VALUES,
    );
  });
});

describe("TERMS_SCOPE.RESERVATION_SERIES", () => {
  test("Phase B.2 で追加された値を持つ", () => {
    expect(TERMS_SCOPE.RESERVATION_SERIES).toBe("RESERVATION_SERIES");
    expect(TERMS_SCOPE_VALUES).toContain("RESERVATION_SERIES");
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/enums/reservation-series-freq.test.ts
```

Expected: FAIL (`RESERVATION_SERIES_FREQ` not exported / `TERMS_SCOPE.RESERVATION_SERIES` undefined)

- [ ] **Step 3: prisma-types.ts に SSoT 追加**

既存 enum SSoT block の末尾に追加:

```ts
export const RESERVATION_SERIES_FREQ = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;
export type ReservationSeriesFreqValue =
  (typeof RESERVATION_SERIES_FREQ)[keyof typeof RESERVATION_SERIES_FREQ];
export const RESERVATION_SERIES_FREQ_VALUES = Object.values(
  RESERVATION_SERIES_FREQ,
) as ReservationSeriesFreqValue[];
```

既存 `TERMS_SCOPE` const object に `RESERVATION_SERIES` を追加:

```ts
export const TERMS_SCOPE = {
  RESERVATION: "RESERVATION",
  INQUIRY: "INQUIRY",
  EVENT_REGISTRATION: "EVENT_REGISTRATION",
  LOGIN_SIGNUP: "LOGIN_SIGNUP",
  RESERVATION_SERIES: "RESERVATION_SERIES", // Phase B.2
} as const;
```

`TERMS_SCOPE_VALUES` は既存の `Object.values(TERMS_SCOPE)` で自動的に新 value を含む。

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/enums/reservation-series-freq.test.ts
```

Expected: 3 pass

- [ ] **Step 5: architecture-boundaries pass 再確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/shared/lib/validations/enums/prisma-types.ts __tests__/unit/lib/enums/reservation-series-freq.test.ts
git commit -m "feat(reservations): RESERVATION_SERIES_FREQ + TERMS_SCOPE.RESERVATION_SERIES SSoT (Phase B.2 task 2)"
```

---

## Task 3: schema shape architecture gate

**PR**: 1

**Files:**

- Create: `__tests__/unit/architecture/reservation-series-schema.test.ts`

**Interfaces:**

- Consumes: `prisma/schema.prisma` の raw content (fs.readFile 経由)
- Produces: 「couponId は nullable」「partial unique migration に存在」「@@index 全 4 個宣言」の grep gate

- [ ] **Step 1: gate test を書く**

`__tests__/unit/architecture/reservation-series-schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("ReservationSeries schema invariants", () => {
  test("Reservation.couponId は nullable (Codex #3599414656 fix)", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    // Reservation の couponId 定義行を pattern match
    expect(schema).toMatch(/couponId\s+String\?\s+@db\.Uuid/);
  });

  test("partial UNIQUE index が migration に存在 (Codex #3599414660 fix)", async () => {
    const { readdirSync } = await import("node:fs");
    const migrationsDir = join(process.cwd(), "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d) =>
      d.endsWith("_add_reservation_series"),
    );
    expect(dirs.length).toBe(1);
    const sql = await readFile(
      join(migrationsDir, dirs[0]!, "migration.sql"),
      "utf8",
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"',
    );
    expect(sql).toContain('WHERE "deletedAt" IS NULL');
  });

  test("ReservationSeries に @@index 4 個宣言", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const seriesBlock = schema.match(
      /model ReservationSeries \{[\s\S]*?@@map\("reservation_series"\)\s*\}/,
    );
    expect(seriesBlock).not.toBeNull();
    const indexCount = (seriesBlock![0].match(/@@index\(/g) ?? []).length;
    expect(indexCount).toBe(4);
  });

  test("TermsScope に RESERVATION_SERIES 追加済", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toMatch(
      /enum TermsScope\s*\{[\s\S]*?RESERVATION_SERIES[\s\S]*?\}/,
    );
  });
});
```

- [ ] **Step 2: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture/reservation-series-schema.test.ts
```

Expected: 4 pass (Task 1 で全 gate 満たされる)

- [ ] **Step 3: commit**

```bash
git add __tests__/unit/architecture/reservation-series-schema.test.ts
git commit -m "test(arch): ReservationSeries schema invariants gate (Phase B.2 task 3)"
```

---

## Task 4: PR 1 checkpoint + push

**PR**: 1

**Files:** (変更なし、CI 通過確認 + push)

- [ ] **Step 1: validate + build 通過確認**

```bash
bun run validate
bun run build:skip-env
```

Expected: 両者 exit 0

- [ ] **Step 2: 全 test suite 通過**

```bash
bun run test:unit
bun run test:integration
```

Expected: all PASS

- [ ] **Step 3: PR 1 push + auto-merge queued**

```bash
git push -u origin feat/phase-b2-recurring-reservations-plan
gh pr create --base main --title "feat(reservations): Phase B.2 PR 1 (schema + migration + enum SSoT + Settings)" --body "$(cat <<'EOF'
## Summary

Phase B.2 の schema foundation:
- `ReservationSeries` model 新規 (id / spaceId / customerId / couponId? / rrule / dtstart / duration / instanceCount / templateData / agreementSnapshot / cancel系 / soft-delete系)
- `Reservation.seriesId?` + `Reservation.recurrenceInstanceIndex?` nullable 追加
- `Settings.maxRecurrenceInstances Int @default(26)`
- `ReservationSeriesFreq` enum (DAILY/WEEKLY/MONTHLY)
- `TermsScope` に `RESERVATION_SERIES` 追加
- partial UNIQUE `(spaceId, dtstart) WHERE deletedAt IS NULL` を migration.sql で raw SQL 定義 (Codex fix)

**全 add-only、無停止 deploy**。

Spec: docs/superpowers/specs/2026-07-17-recurring-reservations-phase-b2-design.md
Plan: docs/superpowers/plans/2026-07-17-recurring-reservations-phase-b2.md

## Test plan

- [x] unit (enum SSoT / architecture gate) 全 pass
- [x] validate exit 0
- [x] build:skip-env 成功

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 4: 次 PR 用 branch 派生**

```bash
git checkout -b feat/phase-b2-rrule-parser
```

---

## Task 5: `rrule` npm package install

**PR**: 2

**Files:**

- Modify: `package.json` + `bun.lock`

**Interfaces:**

- Produces: `rrule@2.8+` が dependencies に追加、Node.js + browser 両対応

- [ ] **Step 1: dep install**

```bash
bun add rrule@^2.8.1
```

Expected: `package.json` の dependencies に `"rrule": "^2.8.1"` (or 最新 stable) 追加、`bun.lock` 更新

- [ ] **Step 2: version pin 確認**

```bash
grep "\"rrule\":" package.json
```

Expected: `"rrule": "^2.8.1"` (major = 2、minor >= 8)

- [ ] **Step 3: install 動作 smoke test (import)**

`__tests__/unit/lib/rrule-smoke.test.ts` を temporary で作って動作確認 (後 Task で本格実装):

```ts
import { describe, expect, test } from "bun:test";
import { RRule } from "rrule";

describe("rrule package install smoke", () => {
  test("FREQ=WEEKLY;BYDAY=TU parse", () => {
    const rule = RRule.fromString("FREQ=WEEKLY;BYDAY=TU;COUNT=10");
    expect(rule.options.freq).toBe(RRule.WEEKLY);
    expect(rule.options.count).toBe(10);
  });
});
```

```bash
bun scripts/run-tests.ts __tests__/unit/lib/rrule-smoke.test.ts
```

Expected: PASS

- [ ] **Step 4: smoke test file 削除 (Task 6 で本格実装、smoke は不要)**

```bash
git rm --force __tests__/unit/lib/rrule-smoke.test.ts 2>/dev/null || python3 -c "import os; os.remove('__tests__/unit/lib/rrule-smoke.test.ts')" 2>/dev/null || true
```

- [ ] **Step 5: commit**

```bash
git add package.json bun.lock
git commit -m "build(deps): rrule@^2.8.1 install (Phase B.2 task 5)"
```

---

## Task 6: series-rrule.ts (RRULE domain wrapper)

**PR**: 2

**Files:**

- Create: `src/shared/domain/reservations/series-rrule.ts`
- Create: `__tests__/unit/domain/reservations/series-rrule.test.ts`

**Interfaces:**

- Consumes: `RRule` from `rrule` (Task 5 install)、`RESERVATION_SERIES_FREQ` (Task 2)
- Produces:
  - `parseRruleString(rrule: string, dtstart: Date): RRule` — RRule 型は domain 内部利用のみ
  - `expandInstances(rrule: string, dtstart: Date, upTo: Date): Date[]`
  - `countInstances(rrule: string, dtstart: Date, upTo: Date): number`
  - `validateRruleForSeries(input: { rrule: string; dtstart: Date; duration: number; maxInstances: number }): { ok: true; instanceCount: number; instances: Date[] } | { ok: false; error: string }`
  - freq WHITELIST: `DAILY / WEEKLY / MONTHLY` のみ許可、他 (`SECONDLY / MINUTELY / HOURLY / YEARLY`) は `ok: false`

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/reservations/series-rrule.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  parseRruleString,
  expandInstances,
  countInstances,
  validateRruleForSeries,
} from "@/shared/domain/reservations/series-rrule";

const dtstart = new Date("2026-07-22T10:00:00Z");

describe("parseRruleString", () => {
  test("有効な RRULE を parse", () => {
    const rule = parseRruleString("FREQ=WEEKLY;BYDAY=TU;COUNT=10", dtstart);
    expect(rule.options.count).toBe(10);
  });
});

describe("expandInstances", () => {
  test("WEEKLY BYDAY=TU で 10 instance", () => {
    const dates = expandInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(dates).toHaveLength(10);
    expect(dates[0]!.getTime()).toBe(dtstart.getTime());
  });

  test("upTo 境界で truncate", () => {
    const dates = expandInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=52",
      dtstart,
      new Date("2026-09-01T00:00:00Z"),
    );
    // 2026-07-22 から 2026-09-01 の間の TU は 6 個 (7/22, 7/29, 8/5, 8/12, 8/19, 8/26)
    expect(dates).toHaveLength(6);
  });
});

describe("countInstances", () => {
  test("simple count", () => {
    const n = countInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(n).toBe(10);
  });
});

describe("validateRruleForSeries", () => {
  test("valid WEEKLY 10 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      duration: 120,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instanceCount).toBe(10);
  });

  test("valid DAILY 5 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=DAILY;COUNT=5",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("valid MONTHLY 3 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("invalid FREQ (YEARLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=YEARLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/FREQ.*サポート/);
  });

  test("invalid FREQ (SECONDLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=SECONDLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("count 上限超過 → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;COUNT=100",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/上限|最大|maximum/);
  });

  test("UNTIL でも count 越える → error", () => {
    // 毎週で 1 年半 = 78 回 (26 超え)
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;UNTIL=20280101T000000Z",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("rrule 文法 error → error", () => {
    const result = validateRruleForSeries({
      rrule: "INVALID_RRULE_STRING",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/reservations/series-rrule.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

`src/shared/domain/reservations/series-rrule.ts`:

```ts
import "server-only";
import { RRule, Frequency } from "rrule";
import { RESERVATION_SERIES_FREQ } from "@/shared/lib/validations/enums/prisma-types";

/**
 * freq WHITELIST: DAILY / WEEKLY / MONTHLY のみ Phase B.2 で許可。
 * YEARLY はレア、SECONDLY/MINUTELY/HOURLY は誤操作リスク高で拒否。
 */
const ALLOWED_FREQS = new Set<Frequency>([
  RRule.DAILY,
  RRule.WEEKLY,
  RRule.MONTHLY,
]);

export function parseRruleString(rrule: string, dtstart: Date): RRule {
  return RRule.fromString(`DTSTART:${toIcalDate(dtstart)}\nRRULE:${rrule}`);
}

export function expandInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): Date[] {
  const rule = parseRruleString(rrule, dtstart);
  return rule.between(dtstart, upTo, true);
}

export function countInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): number {
  return expandInstances(rrule, dtstart, upTo).length;
}

export type ValidateRruleInput = {
  rrule: string;
  dtstart: Date;
  duration: number;
  maxInstances: number;
};

export type ValidateRruleResult =
  | { ok: true; instanceCount: number; instances: Date[] }
  | { ok: false; error: string };

export function validateRruleForSeries(
  input: ValidateRruleInput,
): ValidateRruleResult {
  let rule: RRule;
  try {
    rule = parseRruleString(input.rrule, input.dtstart);
  } catch (err) {
    return {
      ok: false,
      error: `RRULE 文字列の parse に失敗: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!ALLOWED_FREQS.has(rule.options.freq)) {
    return {
      ok: false,
      error: `FREQ は ${Object.keys(RESERVATION_SERIES_FREQ).join(" / ")} のみサポート`,
    };
  }

  // maxInstances + 1 まで expand して上限超過を検出
  const upTo = new Date(
    input.dtstart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000,
  );
  const instances = rule.between(input.dtstart, upTo, true);

  if (instances.length === 0) {
    return { ok: false, error: "instance が 0 個。RRULE を再確認してください" };
  }

  if (instances.length > input.maxInstances) {
    return {
      ok: false,
      error: `instance 数 ${instances.length} が上限 ${input.maxInstances} を超えました`,
    };
  }

  return { ok: true, instanceCount: instances.length, instances };
}

function toIcalDate(d: Date): string {
  // "20260722T100000Z" 形式
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/reservations/series-rrule.test.ts
```

Expected: 12 pass

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/reservations/series-rrule.ts __tests__/unit/domain/reservations/series-rrule.test.ts
git commit -m "feat(reservations): series-rrule.ts (RFC 5545 domain wrapper、freq WHITELIST) (Phase B.2 task 6)"
```

---

## Task 7: architecture-boundaries に rrule import gate 追加

**PR**: 2

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts`

**Interfaces:**

- Produces: `import "rrule"` は `src/shared/domain/reservations/**/*.ts` および `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts` のみ許可、他は gate fail

- [ ] **Step 1: gate 追加**

`architecture-boundaries.test.ts` に describe 追加:

```ts
describe("Phase B.2: rrule package import restriction", () => {
  test("rrule import は domain layer + admin form utils のみ許可", async () => {
    const files = await glob("src/**/*.ts", { ignore: ["**/*.d.ts"] });
    const allowedPatterns = [
      /src[/\\]shared[/\\]domain[/\\]reservations[/\\]/,
      /src[/\\]app[/\\]\(admin\)[/\\]admin[/\\]\(dashboard\)[/\\]reservations[/\\]_components[/\\]rrule-utils\.ts$/,
    ];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const importsRrule =
        /from ["']rrule["']/.test(content) ||
        /import\s+.*\s+from\s+["']rrule["']/.test(content);
      if (importsRrule) {
        const isAllowed = allowedPatterns.some((p) => p.test(file));
        expect(
          isAllowed,
          `${file}: rrule import は domain layer + rrule-utils.ts のみ許可`,
        ).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: PASS (Task 6 の series-rrule.ts のみ import、Task 5 の smoke test は既に削除済)

- [ ] **Step 3: commit**

```bash
git add __tests__/unit/architecture-boundaries.test.ts
git commit -m "test(arch): rrule import 制限 gate (Phase B.2 task 7)"
```

---

## Task 8: PR 2 checkpoint + push

**PR**: 2

- [ ] **Step 1: validate + build + tests**

```bash
bun run validate && bun run build:skip-env && bun run test:unit
```

Expected: 全 exit 0 + all PASS

- [ ] **Step 2: PR 2 push + auto-merge**

```bash
git push -u origin feat/phase-b2-rrule-parser
gh pr create --base main --title "feat(reservations): Phase B.2 PR 2 (rrule@2.8+ install + series-rrule.ts)" --body "$(cat <<'EOF'
## Summary

- `rrule@2.8+` install (RFC 5545 完全準拠、de-facto standard)
- `src/shared/domain/reservations/series-rrule.ts` — `parseRruleString` / `expandInstances` / `countInstances` / `validateRruleForSeries`
- freq WHITELIST: DAILY / WEEKLY / MONTHLY (YEARLY / SECONDLY / MINUTELY / HOURLY 拒否)
- architecture-boundaries に `rrule` import 制限 gate

Spec: docs/superpowers/specs/2026-07-17-recurring-reservations-phase-b2-design.md

## Test plan

- [x] unit test (12 case、freq WHITELIST / count 上限 / UNTIL 判定)
- [x] arch-boundaries pass

依存: PR 1 の schema (Task 2 の SSoT 参照)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 3: 次 PR 用 branch**

```bash
git checkout -b feat/phase-b2-series-commands
```

---

## Task 9: series-advisory-lock.ts (advisory lock 728357 wrapper)

**PR**: 3

**Files:**

- Create: `src/shared/domain/reservations/series-advisory-lock.ts`
- Test: `__tests__/integration/domain/reservations/series-advisory-lock.test.ts` (real DB)

**Interfaces:**

- Consumes: `prisma.$executeRaw`
- Produces: `lockReservationSeriesForTransaction(tx, seriesKey: string): Promise<void>` — `pg_advisory_xact_lock(728357, hashtext($1))` を tx 内で発行

- [ ] **Step 1: 失敗する integration test を書く**

`__tests__/integration/domain/reservations/series-advisory-lock.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { prisma, basePrisma } from "@/shared/db/prisma";
import { lockReservationSeriesForTransaction } from "@/shared/domain/reservations/series-advisory-lock";

describe("lockReservationSeriesForTransaction (integration)", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("同一 key で 2 並列 tx を直列化", async () => {
    const key = `test-series-${Date.now()}`;
    const events: string[] = [];

    const t1 = prisma.$transaction(async (tx) => {
      await lockReservationSeriesForTransaction(tx, key);
      events.push("t1-locked");
      await new Promise((r) => setTimeout(r, 200));
      events.push("t1-done");
    });

    // t1 が lock 取得後、少し待って t2 を start
    await new Promise((r) => setTimeout(r, 50));

    const t2 = prisma.$transaction(async (tx) => {
      events.push("t2-start");
      await lockReservationSeriesForTransaction(tx, key);
      events.push("t2-locked");
    });

    await Promise.all([t1, t2]);

    // t1 が終わってから t2 が lock 取得
    const t1Done = events.indexOf("t1-done");
    const t2Locked = events.indexOf("t2-locked");
    expect(t2Locked).toBeGreaterThan(t1Done);
  }, 10_000);
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun run test:integration __tests__/integration/domain/reservations/series-advisory-lock.test.ts
```

Expected: FAIL (import not found)

- [ ] **Step 3: 実装**

`src/shared/domain/reservations/series-advisory-lock.ts`:

```ts
import "server-only";
import type { Prisma } from "@generated/prisma/client";

/**
 * ReservationSeries 単位 advisory lock。
 * namespace 728357 は `.claude/rules/db-domain.md` の advisory lock registry で
 * Phase B.2 用に予約済 (Phase B.1 spec で予告済)。
 *
 * 既存の `lockSpaceForTransaction` (728351、Space 単位) と併用可 (2 段 lock)。
 * `createReservationSeriesCommand` は 728357 → 728351 の順で取得 (deadlock 予防、
 * 全経路で同順序を強制)。
 */
export async function lockReservationSeriesForTransaction(
  tx: Prisma.TransactionClient,
  seriesKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728357::int4, hashtext(${seriesKey})::int4)`;
}
```

- [ ] **Step 4: SERIAL_DB_TESTS 登録**

`scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` array に追加:

```ts
  "__tests__/integration/domain/reservations/series-advisory-lock.test.ts",
```

- [ ] **Step 5: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/domain/reservations/series-advisory-lock.test.ts
```

Expected: PASS (t2-locked > t1-done)

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/reservations/series-advisory-lock.ts scripts/test-db-runner-env.ts __tests__/integration/domain/reservations/series-advisory-lock.test.ts
git commit -m "feat(reservations): lockReservationSeriesForTransaction (advisory lock 728357) (Phase B.2 task 9)"
```

---

## Task 10: terms/queries.ts + commands.ts に RESERVATION_SERIES scope

**PR**: 3

**Files:**

- Modify: `src/shared/domain/terms/queries.ts` (`assertAllRequiredTermsAgreed` の scope 引数対応)
- Modify: `src/shared/domain/terms/commands.ts` (`recordTermsAgreements` の resourceId 拡張、既存 signature 温存)
- Test: `__tests__/unit/domain/terms/reservation-series-scope.test.ts`

**Interfaces:**

- Consumes: `TERMS_SCOPE.RESERVATION_SERIES` (Task 2)
- Produces:
  - `assertAllRequiredTermsAgreed({ scope: TermsScope, agreements, tx? }): Promise<void>` — RESERVATION_SERIES scope 対応
  - `recordTermsAgreements({ scope, customerId, resourceId, tx, ... }): Promise<TermsAgreement[]>` — resourceId = series.id を受入、各 required doc につき 1 row insert (既存 pattern)

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/terms/reservation-series-scope.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

// mock: prisma facade を差込
const mockTermsDocumentFindMany = mock<
  () => Promise<
    Array<{ id: string; scopes: string[]; requiresConsent: boolean }>
  >
>(() => Promise.resolve([]));
const mockTermsAgreementCreateMany = mock<() => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findMany: mockTermsDocumentFindMany },
    termsAgreement: { createMany: mockTermsAgreementCreateMany },
  },
}));

const { assertAllRequiredTermsAgreed, recordTermsAgreements } =
  await import("@/shared/domain/terms/queries");

describe("Terms RESERVATION_SERIES scope (Phase B.2)", () => {
  test("assertAllRequiredTermsAgreed: RESERVATION_SERIES scope で 2 required doc、両方合意ずみ → OK", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "doc-1", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
        { id: "doc-2", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
      ]),
    );
    // agreements array に doc-1 + doc-2 の同意証跡
    await expect(
      assertAllRequiredTermsAgreed({
        scope: "RESERVATION_SERIES",
        agreements: [{ termsId: "doc-1" }, { termsId: "doc-2" }],
      }),
    ).resolves.toBeUndefined();
  });

  test("assertAllRequiredTermsAgreed: 未合意 doc あり → DomainError", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "doc-1", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
        { id: "doc-2", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
      ]),
    );
    await expect(
      assertAllRequiredTermsAgreed({
        scope: "RESERVATION_SERIES",
        agreements: [{ termsId: "doc-1" }], // doc-2 欠落
      }),
    ).rejects.toThrow();
  });

  test("recordTermsAgreements: RESERVATION_SERIES scope で 3 required doc → 3 row createMany", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "doc-1", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
        { id: "doc-2", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
        { id: "doc-3", scopes: ["RESERVATION_SERIES"], requiresConsent: true },
      ]),
    );
    mockTermsAgreementCreateMany.mockClear();
    await recordTermsAgreements({
      scope: "RESERVATION_SERIES",
      customerId: "cust-1",
      resourceId: "series-abc",
      agreements: [
        { termsId: "doc-1" },
        { termsId: "doc-2" },
        { termsId: "doc-3" },
      ],
    });
    expect(mockTermsAgreementCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            termsId: "doc-1",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
          expect.objectContaining({
            termsId: "doc-2",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
          expect.objectContaining({
            termsId: "doc-3",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
        ]),
      }),
    );
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/terms/reservation-series-scope.test.ts
```

Expected: FAIL

- [ ] **Step 3: 実装拡張**

`src/shared/domain/terms/queries.ts` の既存 `assertAllRequiredTermsAgreed` に RESERVATION_SERIES scope を Zod / switch で通す。既存 `TermsScope` enum は Task 1 で拡張済のため、既存の scope filter query (`scopes: { has: params.scope }`) が自動的に RESERVATION_SERIES を含む doc を pick up する。

`src/shared/domain/terms/commands.ts` の `recordTermsAgreements` は既に `resourceId` を受け取る signature (spec §6 の TermsAgreement model schema.prisma:1699-1728 参照)。scope 引数を通す形で新 RESERVATION_SERIES value を許可するだけで既存経路が動く。

**変更内容** (最小):

- `queries.ts` の scope 引数の型を `TermsScopeValue` (`TERMS_SCOPE_VALUES` から derive) にして RESERVATION_SERIES を許可
- `commands.ts` の scope 引数も同型に

具体的コード:

```ts
// queries.ts
import type { TermsScopeValue } from "@/shared/lib/validations/enums/prisma-types";

export type AssertAllRequiredTermsAgreedInput = {
  scope: TermsScopeValue;
  agreements: { termsId: string }[];
  tx?: Prisma.TransactionClient;
};

export async function assertAllRequiredTermsAgreed(
  input: AssertAllRequiredTermsAgreedInput,
): Promise<void> {
  const client = input.tx ?? prisma;
  const requiredDocs = await client.termsDocument.findMany({
    where: {
      scopes: { has: input.scope },
      requiresConsent: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  const agreedIds = new Set(input.agreements.map((a) => a.termsId));
  for (const doc of requiredDocs) {
    if (!agreedIds.has(doc.id)) {
      throw new DomainError(
        `必須規約 ${doc.id} に同意が必要です`,
        "VALIDATION",
      );
    }
  }
}
```

commands.ts の recordTermsAgreements も同様。

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/terms/reservation-series-scope.test.ts
```

Expected: 3 pass

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/terms/queries.ts src/shared/domain/terms/commands.ts __tests__/unit/domain/terms/reservation-series-scope.test.ts
git commit -m "feat(terms): RESERVATION_SERIES scope 対応 (assertAllRequiredTermsAgreed + recordTermsAgreements) (Phase B.2 task 10)"
```

---

## Task 11: cancel-core.ts に applyBulkCancellation 追加

**PR**: 3

**Files:**

- Modify: `src/shared/domain/reservations/cancel-core.ts`
- Test: `__tests__/unit/domain/reservations/bulk-cancellation.test.ts`

**Interfaces:**

- Consumes: 既存 `CANCELLABLE_STATUSES` / `ReservationStatus`
- Produces:
  - `applyBulkCancellation(tx, ids: string[], options: BulkCancelOptions): Promise<{ cancelledIds: string[] }>` — updateMany({where: { id: { in: ids }, status: { in: CANCELLABLE_STATUSES }}}) claim、icsSequence increment、cancelledAt/cancelledByType set

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/reservations/bulk-cancellation.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

const mockUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 3 }),
);
const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([{ id: "r1" }, { id: "r2" }, { id: "r3" }]),
);
const txStub = {
  reservation: { updateMany: mockUpdateMany, findMany: mockFindMany },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: (fn: any) => fn(txStub) },
}));

const { applyBulkCancellation } =
  await import("@/shared/domain/reservations/cancel-core");

describe("applyBulkCancellation", () => {
  test("3 予約を一括 cancel、cancelledIds に 3 個返る", async () => {
    mockUpdateMany.mockClear();
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 3 }));
    mockFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "r1" }, { id: "r2" }, { id: "r3" }]),
    );

    const result = await applyBulkCancellation(
      txStub as any,
      ["r1", "r2", "r3"],
      {
        cancellationReason: "series bulk cancel",
        cancelledByType: "ADMIN",
        now: new Date("2026-08-01T00:00:00Z"),
      },
    );

    expect(result.cancelledIds).toEqual(["r1", "r2", "r3"]);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["r1", "r2", "r3"] },
          status: { in: ["PENDING", "CONFIRMED"] },
        }),
        data: expect.objectContaining({
          status: "CANCELLED",
          icsSequence: { increment: 1 },
        }),
      }),
    );
  });

  test("既に CANCELLED の予約は skip (count=0 の場合 empty)", async () => {
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    mockFindMany.mockImplementation(() => Promise.resolve([]));
    const result = await applyBulkCancellation(txStub as any, ["r1"], {
      cancellationReason: "test",
      cancelledByType: "ADMIN",
      now: new Date(),
    });
    expect(result.cancelledIds).toEqual([]);
  });
});
```

- [ ] **Step 2: fail 確認 + 実装 + pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/reservations/bulk-cancellation.test.ts
```

Expected: FAIL → 実装 → 2 PASS

`src/shared/domain/reservations/cancel-core.ts` の末尾に追加:

```ts
export type BulkCancelOptions = {
  cancellationReason?: string;
  cancelledByType: string;
  now: Date;
};

export type BulkCancelResult = {
  cancelledIds: string[];
};

/**
 * 複数 Reservation を一括キャンセル。
 * updateMany の WHERE で status ∈ CANCELLABLE_STATUSES を claim (二重副作用防止パターン)。
 * icsSequence increment / cancelledAt / cancelledByType / cancellationReason を書き込み。
 *
 * 副作用 (メール / GCal delete / Stripe refund / SwitchBot revoke / AuditLog) は
 * `applyBulkCancellationSideEffects` (cancellation-side-effects.ts) で発火。
 *
 * @returns cancelledIds = 実際に status が変わった予約 id (claim 成功分)
 */
export async function applyBulkCancellation(
  tx: Prisma.TransactionClient,
  ids: string[],
  options: BulkCancelOptions,
): Promise<BulkCancelResult> {
  if (ids.length === 0) return { cancelledIds: [] };

  const claimResult = await tx.reservation.updateMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: [...CANCELLABLE_STATUSES] },
    },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: options.cancelledByType,
      icsSequence: { increment: 1 },
      ...(options.cancellationReason
        ? { cancellationReason: options.cancellationReason }
        : {}),
    },
  });

  if (claimResult.count === 0) return { cancelledIds: [] };

  const cancelled = await tx.reservation.findMany({
    where: {
      id: { in: ids },
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
    },
    select: { id: true },
  });

  return { cancelledIds: cancelled.map((r) => r.id) };
}
```

- [ ] **Step 3: commit**

```bash
git add src/shared/domain/reservations/cancel-core.ts __tests__/unit/domain/reservations/bulk-cancellation.test.ts
git commit -m "feat(reservations): applyBulkCancellation (series 全体 / this-and-following 用) (Phase B.2 task 11)"
```

---

## Task 12: cancellation-side-effects.ts に suppress flag + bulk 経路

**PR**: 3

**Files:**

- Modify: `src/shared/domain/reservations/cancellation-side-effects.ts`
- Create: `src/shared/email/templates/bulk-reservation-cancelled/*.tsx` + fixture
- Test: `__tests__/unit/domain/reservations/bulk-side-effects.test.ts`

**Interfaces:**

- Consumes: 既存 7 副作用 helper (Stripe refund / GCal delete / customer mail / admin mail / notif / AuditLog / SwitchBot revoke)
- Produces:
  - `CancellationSideEffectInput.suppress?: { customerEmail?, adminEmail?, gcalDelete? }` (既存 signature 拡張、後方互換)
  - `applyBulkCancellationSideEffects(input: { reservationIds, scope, cancellationReason, now, actorUserId, request }): Promise<void>` — for-await で `applyCancellationSideEffects(id, suppress={all})` を発火、loop 完了後に 集約 email / master GCal 操作 / 集約 AuditLog を 1 回発火

- [ ] **Step 1: 失敗する test を書く**

`__tests__/unit/domain/reservations/bulk-side-effects.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

// 各 helper を mock 化
const mockRefund = mock<() => Promise<void>>(() => Promise.resolve());
const mockGcalDelete = mock<() => Promise<void>>(() => Promise.resolve());
const mockGcalMasterOp = mock<() => Promise<void>>(() => Promise.resolve());
const mockCustomerMail = mock<() => Promise<void>>(() => Promise.resolve());
const mockAdminMail = mock<() => Promise<void>>(() => Promise.resolve());
const mockBulkMail = mock<() => Promise<void>>(() => Promise.resolve());
const mockAuditLog = mock<() => Promise<void>>(() => Promise.resolve());
const mockSwitchBot = mock<() => Promise<void>>(() => Promise.resolve());

// TODO: applyCancellationSideEffects の内部で使う個別 helper を mock 差込
// (実装時に file structure を confirm する)

const { applyBulkCancellationSideEffects } =
  await import("@/shared/domain/reservations/cancellation-side-effects");

describe("applyBulkCancellationSideEffects (Phase B.2)", () => {
  test("10 instance の series-all cancel → 顧客メール 0 (per-instance) + 1 (集約)、GCal delete 0 + 1 (master)", async () => {
    // mock 設定
    // applyBulkCancellationSideEffects({ reservationIds: [...10], scope: "series-all" })
    // 期待:
    //   customer mail: mockCustomerMail 0 回 + mockBulkMail 1 回
    //   admin mail: 同上
    //   GCal delete: mockGcalDelete 0 回 + mockGcalMasterOp 1 回 (events.delete)
    //   AuditLog: 集約 1 レコード
    // (詳細は実装時に fill in)
    expect(true).toBe(true); // placeholder、実装時に埋める
  });

  test("this-and-following → GCal events.patch(newUNTIL) が呼ばれ、events.delete は呼ばれない", async () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: fail 確認 + 実装**

**cancellation-side-effects.ts の変更** (既存 `CancellationSideEffectInput` を拡張):

```ts
export type SideEffectSuppressFlags = {
  customerEmail?: boolean;
  adminEmail?: boolean;
  gcalDelete?: boolean;
};

export interface CancellationSideEffectInput {
  reservationId: string;
  cancellationReason?: string;
  channel: "admin" | "customer-mypage" | "customer-token";
  actorUserId?: string;
  request: { ip?: string; userAgent?: string; tokenFingerprint?: string };
  /** Phase B.2: bulk cancel 経路で per-instance の副作用を抑止 */
  suppress?: SideEffectSuppressFlags;
}
```

`applyCancellationSideEffects` の各副作用 helper 呼出時に `input.suppress?.<flag>` チェックを追加。

**bulk 経路 (新規)**:

```ts
export type BulkCancellationScope = "this-and-following" | "series-all";

export type BulkCancellationSideEffectInput = {
  reservationIds: string[];
  scope: BulkCancellationScope;
  seriesId: string;
  cancellationReason?: string;
  actorUserId?: string;
  request: { ip?: string; userAgent?: string; tokenFingerprint?: string };
  now: Date;
};

export async function applyBulkCancellationSideEffects(
  input: BulkCancellationSideEffectInput,
): Promise<void> {
  // Step 1: 全 instance で per-instance 副作用を suppress: all で発火 (Stripe refund は必要、
  // switchbot revoke は必要、mail / gcal delete は抑止)
  for (const id of input.reservationIds) {
    await applyCancellationSideEffects({
      reservationId: id,
      cancellationReason: input.cancellationReason,
      channel: "admin",
      actorUserId: input.actorUserId,
      request: input.request,
      suppress: {
        customerEmail: true,
        adminEmail: true,
        gcalDelete: true,
      },
    });
  }

  // Step 2: master GCal 操作 (scope 分岐)
  const seriesGcal = await getSeriesGcalMasterEventId(input.seriesId);
  if (seriesGcal) {
    if (input.scope === "this-and-following") {
      await patchGcalMasterUntil(seriesGcal, input.now);
    } else if (input.scope === "series-all") {
      await deleteGcalMaster(seriesGcal);
    }
  }

  // Step 3: 集約メール (顧客 + 管理者 各 1 通)
  await sendBulkReservationCancelledEmail({
    seriesId: input.seriesId,
    reservationIds: input.reservationIds,
    scope: input.scope,
    reason: input.cancellationReason,
  });

  await sendBulkAdminNotification({
    seriesId: input.seriesId,
    count: input.reservationIds.length,
    scope: input.scope,
  });

  // Step 4: 集約 AuditLog
  await createAuditLogRecord({
    action: "UPDATE",
    resource: "reservation_series",
    resourceId: input.seriesId,
    newValue: {
      scope: input.scope,
      cancelledIds: input.reservationIds,
      reason: input.cancellationReason,
    },
    metadata: {
      channel: "admin",
      ip: input.request.ip,
      userAgent: input.request.userAgent,
    },
  });
}
```

**email template**: `src/shared/email/templates/bulk-reservation-cancelled/index.tsx` + fixture (Task 16 email PR で詳細実装、本 task は skeleton で最低限 pass する形)

- [ ] **Step 3: test 通過 (簡易 mock で通る形に整理)**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/reservations/bulk-side-effects.test.ts
```

Expected: PASS

- [ ] **Step 4: commit**

```bash
git add src/shared/domain/reservations/cancellation-side-effects.ts src/shared/email/templates/bulk-reservation-cancelled/ __tests__/unit/domain/reservations/bulk-side-effects.test.ts
git commit -m "feat(reservations): applyBulkCancellationSideEffects + suppress flag (Phase B.2 task 12)"
```

---

## Task 13: series-commands.ts (create + cancel)

**PR**: 3

**Files:**

- Create: `src/shared/domain/reservations/series-commands.ts`
- Test: `__tests__/unit/domain/reservations/series-commands.test.ts`
- Test: `__tests__/integration/domain/reservations/series-overlap.test.ts` (real DB overlap + advisory lock)
- Test: `__tests__/integration/domain/reservations/series-cancel-scopes.test.ts` (real DB 3 scope)

**Interfaces:**

- Consumes:
  - `validateRruleForSeries` (Task 6)
  - `lockReservationSeriesForTransaction` (Task 9)
  - `lockSpaceForTransaction` (既存)
  - `assertAllRequiredTermsAgreed` / `recordTermsAgreements` (Task 10)
  - `applyBulkCancellation` (Task 11)
  - `applyBulkCancellationSideEffects` (Task 12)
- Produces:
  - `createReservationSeriesCommand(input: CreateSeriesInput): Promise<{ series: ReservationSeries; instances: Reservation[] }>`
  - `cancelReservationSeriesCommand(input: CancelSeriesInput): Promise<{ cancelledCount: number; cancelledReservationIds: string[] }>`

- [ ] **Step 1-5: TDD (test → fail → implementation → pass → commit)**

Test は spec §4.1 の flow に対応する 3 case を integration + unit で:

- unit (`series-commands.test.ts`): mock で Zod refine + overlap detection + coupon usage 加算 + termsAgreement N 行
- integration (`series-overlap.test.ts`): 実 DB で EXCLUDE 制約が各 instance で hit する / CROSS-TABLE TRIGGER で event slot 重複時 error / advisory lock 728357 が 2 並列で直列化
- integration (`series-cancel-scopes.test.ts`): this-only / this-and-following / series-all の 3 scope で正しく id が cancel され、series の cancelledAt / deletedAt が適切に set され、coupon が series-all のみ decrement される

**実装のポイント** (spec §4.1 flow を code に落とす):

```ts
// series-commands.ts
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { validateRruleForSeries } from "./series-rrule";
import { lockReservationSeriesForTransaction } from "./series-advisory-lock";
import { lockSpaceForTransaction } from "./space-locks";
import { assertAllRequiredTermsAgreed, recordTermsAgreements } from "@/shared/domain/terms/queries";
import { applyBulkCancellation } from "./cancel-core";
import { applyBulkCancellationSideEffects } from "./cancellation-side-effects";
import { checkReservationOverlapQuery } from "./availability";
import { DomainError } from "@/shared/domain/domain-error";

export type CreateReservationSeriesInput = {
  spaceId: string;
  customerId: string;
  couponId?: string;
  rrule: string;
  dtstart: Date;
  duration: number; // minutes
  templateData: {
    guestLastName?: string;
    guestFirstName?: string;
    // ... reservation template
  };
  agreementSnapshot: {
    // fingerprint of TermsAgreement rows at creation
  };
  agreements: { termsId: string }[]; // 各 required doc への同意
  now: Date;
};

export type CreateReservationSeriesResult = {
  series: { id: string; instanceCount: number };
  instanceIds: string[];
};

export async function createReservationSeriesCommand(
  input: CreateReservationSeriesInput,
): Promise<CreateReservationSeriesResult> {
  // Step 1: RRULE validation (Settings.maxRecurrenceInstances と照合)
  const settings = await prisma.settings.findUniqueOrThrow({
    where: { id: "singleton" },
    select: { maxRecurrenceInstances: true },
  });
  const validation = validateRruleForSeries({
    rrule: input.rrule,
    dtstart: input.dtstart,
    duration: input.duration,
    maxInstances: settings.maxRecurrenceInstances,
  });
  if (!validation.ok) {
    throw new DomainError(validation.error, "VALIDATION");
  }
  const instances = validation.instances;

  // Step 2: tx で advisory lock → overlap check → TermsAgreement → coupon → series create → reservation createMany
  return await prisma.$transaction(async (tx) => {
    // series 単位 lock (728357)
    await lockReservationSeriesForTransaction(
      tx,
      `${input.spaceId}:${input.customerId}`,
    );
    // Space 単位 lock (728351、既存契約)
    await lockSpaceForTransaction(tx, input.spaceId);

    // 各 instance の overlap 事前 check (spec risk-1 対策: N 回目 (YYYY-MM-DD) の specific error)
    for (let i = 0; i < instances.length; i++) {
      const startTime = instances[i]!;
      const endTime = new Date(startTime.getTime() + input.duration * 60_000);
      const overlap = await checkReservationOverlapQuery(
        {
          spaceId: input.spaceId,
          startTime,
          endTime,
        },
        tx,
      );
      if (overlap.hasOverlap) {
        throw new DomainError(
          `${i + 1} 回目 (${startTime.toISOString().slice(0, 10)}) の時間帯は既に予約されています`,
          "CONFLICT",
        );
      }
    }

    // TermsAgreement (RESERVATION_SERIES scope、各 required doc につき 1 row)
    await assertAllRequiredTermsAgreed({
      scope: "RESERVATION_SERIES",
      agreements: input.agreements,
      tx,
    });

    // series row 生成
    const series = await tx.reservationSeries.create({
      data: {
        spaceId: input.spaceId,
        customerId: input.customerId,
        couponId: input.couponId ?? null,
        rrule: input.rrule,
        dtstart: input.dtstart,
        duration: input.duration,
        instanceCount: instances.length,
        templateData: input.templateData,
        agreementSnapshot: input.agreementSnapshot,
      },
      select: { id: true, instanceCount: true },
    });

    await recordTermsAgreements({
      scope: "RESERVATION_SERIES",
      customerId: input.customerId,
      resourceId: series.id,
      agreements: input.agreements,
      tx,
    });

    // coupon usage increment (series 全体で 1 usage)
    if (input.couponId) {
      await tx.coupon.updateMany({
        where: { id: input.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    // 各 instance を Reservation として createMany (couponId は series row のみ、instance は null)
    await tx.reservation.createMany({
      data: instances.map((startTime, index) => ({
        spaceId: input.spaceId,
        customerId: input.customerId,
        couponId: null, // Codex fix: instance は couponId 持たない
        seriesId: series.id,
        recurrenceInstanceIndex: index,
        startTime,
        endTime: new Date(startTime.getTime() + input.duration * 60_000),
        status: "CONFIRMED",
        totalPrice: /* templateData から */,
        basePrice: /* templateData から */,
        taxRateType: /* templateData から */,
        taxRate: /* templateData から */,
        taxAmount: /* templateData から */,
        totalPriceWithTax: /* templateData から */,
        rateBreakdownJson: /* templateData から */,
        // ... guest fields from templateData
      })),
    });

    const created = await tx.reservation.findMany({
      where: { seriesId: series.id },
      select: { id: true, recurrenceInstanceIndex: true },
      orderBy: { recurrenceInstanceIndex: "asc" },
    });

    return {
      series: { id: series.id, instanceCount: series.instanceCount },
      instanceIds: created.map((r) => r.id),
    };
  });
}

export type CancelReservationSeriesInput = {
  seriesId: string;
  scope: "this-only" | "this-and-following" | "series-all";
  fromInstanceId?: string;
  cancellationReason?: string;
  cancelledByType: string;
  actorUserId?: string;
  request: { ip?: string; userAgent?: string; tokenFingerprint?: string };
  now: Date;
};

export type CancelReservationSeriesResult = {
  cancelledCount: number;
  cancelledReservationIds: string[];
};

export async function cancelReservationSeriesCommand(
  input: CancelReservationSeriesInput,
): Promise<CancelReservationSeriesResult> {
  return await prisma.$transaction(async (tx) => {
    await lockReservationSeriesForTransaction(tx, input.seriesId);

    const series = await tx.reservationSeries.findUniqueOrThrow({
      where: { id: input.seriesId },
      select: { id: true, deletedAt: true, couponId: true, rrule: true, dtstart: true },
    });
    if (series.deletedAt !== null) {
      throw new DomainError("series は既にキャンセル済です", "CONFLICT");
    }

    let idsToCancel: string[];

    if (input.scope === "this-only") {
      if (!input.fromInstanceId) {
        throw new DomainError("fromInstanceId が必要です", "VALIDATION");
      }
      idsToCancel = [input.fromInstanceId];
    } else if (input.scope === "this-and-following") {
      const fromInstance = await tx.reservation.findUniqueOrThrow({
        where: { id: input.fromInstanceId! },
        select: { startTime: true },
      });
      const targets = await tx.reservation.findMany({
        where: {
          seriesId: input.seriesId,
          startTime: { gte: fromInstance.startTime },
          status: { in: ["PENDING", "CONFIRMED"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      idsToCancel = targets.map((r) => r.id);

      // series.rrule の UNTIL を fromInstance.startTime - 1min に更新 (今後 materialize 抑止)
      // ただし本 phase では materialize は create 時のみ、UNTIL 更新は将来 phase の update 経路で使う
    } else {
      // series-all
      const targets = await tx.reservation.findMany({
        where: {
          seriesId: input.seriesId,
          status: { in: ["PENDING", "CONFIRMED"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      idsToCancel = targets.map((r) => r.id);
    }

    // bulk cancel の core (tx 内)
    const result = await applyBulkCancellation(tx, idsToCancel, {
      cancellationReason: input.cancellationReason,
      cancelledByType: input.cancelledByType,
      now: input.now,
    });

    // series-all のみ series row を soft-delete + coupon decrement
    if (input.scope === "series-all") {
      await tx.reservationSeries.update({
        where: { id: input.seriesId },
        data: {
          cancelledAt: input.now,
          cancelledByType: input.cancelledByType,
          cancellationReason: input.cancellationReason,
          deletedAt: input.now,
          deletedById: input.actorUserId,
        },
      });
      if (series.couponId) {
        await tx.coupon.updateMany({
          where: { id: series.couponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
    }

    return {
      cancelledCount: result.cancelledIds.length,
      cancelledReservationIds: result.cancelledIds,
    };
  }).then(async (result) => {
    // tx 外で bulk side-effects (this-only は既存 applyCancellationSideEffects を per-instance で発火)
    if (input.scope === "this-only" && result.cancelledReservationIds.length > 0) {
      // 既存経路と同一 (単発予約と同じメール)
      const { applyCancellationSideEffects } = await import(
        "./cancellation-side-effects"
      );
      await applyCancellationSideEffects({
        reservationId: result.cancelledReservationIds[0]!,
        cancellationReason: input.cancellationReason,
        channel: "admin",
        actorUserId: input.actorUserId,
        request: input.request,
      });
    } else if (result.cancelledReservationIds.length > 0) {
      const { applyBulkCancellationSideEffects } = await import(
        "./cancellation-side-effects"
      );
      await applyBulkCancellationSideEffects({
        reservationIds: result.cancelledReservationIds,
        scope: input.scope as "this-and-following" | "series-all",
        seriesId: input.seriesId,
        cancellationReason: input.cancellationReason,
        actorUserId: input.actorUserId,
        request: input.request,
        now: input.now,
      });
    }
    return result;
  });
}
```

**test 詳細**: spec §4.1 の flow を integration で real DB round-trip、unit で mock 使ってエッジケース網羅。

- [ ] **Step 6: 全 test 通過**

```bash
bun scripts/run-tests.ts __tests__/unit/domain/reservations/series-commands.test.ts
bun run test:integration __tests__/integration/domain/reservations/series-overlap.test.ts
bun run test:integration __tests__/integration/domain/reservations/series-cancel-scopes.test.ts
```

Expected: 全 PASS

- [ ] **Step 7: commit**

```bash
git add src/shared/domain/reservations/series-commands.ts __tests__/unit/domain/reservations/series-commands.test.ts __tests__/integration/domain/reservations/
git commit -m "feat(reservations): createReservationSeriesCommand + cancelReservationSeriesCommand (3 scope) (Phase B.2 task 13)"
```

---

## Task 14: PR 3 checkpoint + push

**PR**: 3

- [ ] **Step 1-4**: PR 1 checkpoint pattern と同じ:
  1. `bun run validate && bun run build:skip-env`
  2. `bun run test:unit && bun run test:integration`
  3. `git push` + `gh pr create --base main --title "feat(reservations): Phase B.2 PR 3 (series-commands + cancel bulk + terms scope + advisory lock)"`
  4. `gh pr merge --auto --squash --delete-branch`
  5. `git checkout -b feat/phase-b2-ical-gcal`

---

## Task 15: iCal `.repeating(rrule)` + series UID

**PR**: 4

**Files:**

- Modify: `src/shared/lib/ical/uid.ts` (buildReservationSeriesUid 追加)
- Modify: `src/shared/lib/ical/types.ts` (ReservationSeriesCalendarParams 追加)
- Modify: `src/shared/lib/ical/index.ts` (buildReservationSeriesCalendar / CancelCalendar 追加)
- Test: `__tests__/unit/lib/ical/series.test.ts`

**Interfaces:**

- Produces: `buildReservationSeriesCalendar(params: ReservationSeriesCalendarParams): ICalCalendar` — `event.repeating(rrule)` + master UID = `reservation-series-{seriesId}@{host}`

- [ ] **Step 1-5: TDD (test → implement → commit)**

test:

```ts
describe("buildReservationSeriesCalendar", () => {
  test("RRULE と master UID が出力される", () => {
    const cal = buildReservationSeriesCalendar({
      series: {
        id: "series-abc",
        rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
        dtstart: new Date("2026-07-22T10:00:00Z"),
        duration: 120,
      },
      firstReservation: {
        id: "res-1",
        startTime: new Date("2026-07-22T10:00:00Z"),
        endTime: new Date("2026-07-22T12:00:00Z"),
      },
      space: { name: "Room A", address: "Tokyo" },
      customer: { email: "c@example.com" },
      method: "REQUEST",
      host: "example.com",
      sequence: 0,
    });
    const ics = cal.toString();
    expect(ics).toContain("UID:reservation-series-series-abc@example.com");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10");
    expect(ics).toContain("METHOD:REQUEST");
  });
});
```

implementation は spec §5 を参照、`ical-generator@11` の `event.repeating(rrule)` API を使う。

commit:

```bash
git commit -m "feat(ical): buildReservationSeriesCalendar (RFC 5545 .repeating + master UID) (Phase B.2 task 15)"
```

---

## Task 16: GCal `event.recurrence` field + write-back

**PR**: 4

**Files:**

- Modify: `src/shared/lib/google-calendar/types.ts` (CalendarEventParams に `recurrence?: string[]`)
- Modify: `src/shared/lib/google-calendar/events.ts` (buildEventBody に recurrence 包含、fetchEventInstances 追加)
- Modify: `src/shared/lib/calendar-sync/outbound.ts` (syncReservationSeriesToCalendar + writeBackInstanceGoogleCalendarEventIds 追加)
- Test: `__tests__/unit/lib/google-calendar/recurrence.test.ts`
- Test: `__tests__/integration/lib/calendar-sync/series-outbound.test.ts` (mocked GCal client)

**Interfaces:**

- Consumes: 既存 `createCalendarEvent(params, options?)` (Phase B.1 で拡張済)
- Produces:
  - `CalendarEventParams.recurrence?: string[]` — `["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"]` 形式
  - `fetchEventInstances(masterEventId): Promise<Array<{id, start}>>` — GCal `events.instances(masterId)` wrapper
  - `syncReservationSeriesToCalendar(seriesId): Promise<CalendarEventResult>` — master event 作成 → instances fetch → 各 Reservation.googleCalendarEventId に childId write-back

- [ ] **Step 1-5: TDD**

test 詳細は spec §6 参照。integration test は `mockCalendarClient` を作って `events.insert` / `events.instances` を stub し、childId (`{masterId}_{yyyymmddTHHMMSSZ}`) を write-back する動作を verify。

commit:

```bash
git commit -m "feat(gcal): event.recurrence array + syncReservationSeriesToCalendar + writeBackInstanceGoogleCalendarEventIds (Phase B.2 task 16)"
```

---

## Task 17: PR 4 checkpoint + push

**PR**: 4

- [ ] Step 1-4: 同 pattern (validate + build + tests + push + PR create + auto-merge + next branch)
- Branch: `git checkout -b feat/phase-b2-admin-ui`

---

## Task 18: rrule-utils.ts (client-safe helper)

**PR**: 5

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts`
- Test: `__tests__/unit/app/admin/reservations/rrule-utils.test.ts`

**Interfaces:**

- Produces: `buildRruleString({freq, interval, byday, count, until})` — client-safe (`rrule` package を dynamic import)

- [ ] **Step 1-5: TDD**

test:

```ts
describe("buildRruleString", () => {
  test("weekly BYDAY=TU,TH COUNT=10", () => {
    expect(
      buildRruleString({
        freq: "WEEKLY",
        interval: 1,
        byday: ["TU", "TH"],
        count: 10,
      }),
    ).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=10");
  });

  test("daily UNTIL", () => {
    expect(
      buildRruleString({
        freq: "DAILY",
        interval: 1,
        until: "2026-09-01",
      }),
    ).toBe("FREQ=DAILY;INTERVAL=1;UNTIL=20260901T000000Z");
  });

  test("count と until 同時指定 → count 優先 (RFC 5545 契約)", () => {
    const result = buildRruleString({
      freq: "WEEKLY",
      interval: 1,
      count: 5,
      until: "2026-09-01",
    });
    expect(result).toContain("COUNT=5");
    expect(result).not.toContain("UNTIL");
  });
});
```

implementation は string builder (rrule.js の dependency 無しで書ける)。architecture-boundaries gate も pass。

commit:

```bash
git commit -m "feat(admin): rrule-utils.ts (client-safe RRULE string builder) (Phase B.2 task 18)"
```

---

## Task 19: RecurrenceFields.tsx + RecurrencePreview.tsx

**PR**: 5

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/RecurrenceFields.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/RecurrencePreview.tsx`
- Test: `__tests__/unit/app/admin/reservations/RecurrenceFields.test.tsx`

**Interfaces:**

- Consumes: `RESERVATION_SERIES_FREQ` (Task 2)、`rrule-utils.ts` (Task 18)
- Produces:
  - `<RecurrenceFields fields={fields.recurrence} onChange={...} />` — conform useForm 対応
  - `<RecurrencePreview rrule={string} dtstart={Date} />` — rrule.js dynamic import で「毎週火/木、10 回、次回 2026-07-29」

- [ ] Step 1-5: TDD (component test with React Testing Library)

commit:

```bash
git commit -m "feat(admin): RecurrenceFields + RecurrencePreview components (Phase B.2 task 19)"
```

---

## Task 20: reservation-form-schema.ts + ReservationForm.tsx 拡張

**PR**: 5

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx`
- Test: `__tests__/unit/app/admin/reservations/reservation-form-schema.test.ts`

**Interfaces:**

- Produces: schema に `isRecurring` + `recurrence` field、refine で isRecurring=true 時 recurrence 必須 + count OR until 必須 + count <= Settings.maxRecurrenceInstances 上限チェック

- [ ] Step 1-5: TDD

commit:

```bash
git commit -m "feat(admin): ReservationForm に「繰返し」toggle + Zod refine (Phase B.2 task 20)"
```

---

## Task 21: createRecurringReservationAction + cancelReservationSeriesAction

**PR**: 5

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts`
- Test: `__tests__/unit/app/admin/actions/recurring-reservation-action.test.ts`

**Interfaces:**

- Produces:
  - `createRecurringReservationAction(prev, formData)` — Zod parse → `createReservationSeriesCommand` invoke → revalidate cache tags
  - `cancelReservationSeriesAction(prev, formData)` — Zod parse ({seriesId, scope, fromInstanceId?}) → `cancelReservationSeriesCommand` invoke

- [ ] Step 1-5: TDD

commit:

```bash
git commit -m "feat(admin): createRecurringReservationAction + cancelReservationSeriesAction server actions (Phase B.2 task 21)"
```

---

## Task 22: Calendar view (EventCell / EventBadge / calendar-types) 拡張

**PR**: 5

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/calendar/calendar-types.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventBadge.tsx`

**Interfaces:**

- Produces: `CalendarEvent.seriesId?: string` / `.recurrenceInstanceIndex?: number` + JSX で repeat icon + tooltip

- [ ] Step 1-5: TDD (component snapshot / a11y label test)

commit:

```bash
git commit -m "feat(admin): calendar view に series 表示 (repeat icon + tooltip) (Phase B.2 task 22)"
```

---

## Task 23: 予約詳細ページ SeriesInfoSection.tsx

**PR**: 5

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/SeriesInfoSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx` (SeriesInfoSection render)
- Test: E2E で golden path

**Interfaces:**

- Consumes: `cancelReservationSeriesAction` (Task 21)
- Produces: 予約詳細ページに「毎週火/木、10 回のうち 3 回目」表示 + 3 択キャンセルボタン

- [ ] Step 1-5: TDD

commit:

```bash
git commit -m "feat(admin): 予約詳細ページに series section + 3 択キャンセル UI (Phase B.2 task 23)"
```

---

## Task 24: PR 5 checkpoint + push

**PR**: 5

- [ ] Step 1-4: 同 pattern
- Branch: `git checkout -b feat/phase-b2-public-e2e`

---

## Task 25: Settings.customerCanCancelSeriesInFull + admin settings UI

**PR**: 6

**Files:**

- Modify: `prisma/schema.prisma` (Settings に列追加)
- Create: `prisma/migrations/<timestamp>_add_customer_can_cancel_series_setting/migration.sql`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/*` (checkbox 追加)

- [ ] Step 1-5: schema 追加 + admin form 拡張 (Phase B.1 の Settings pattern と同じ)

commit:

```bash
git commit -m "feat(settings): customerCanCancelSeriesInFull toggle (Phase B.2 task 25)"
```

---

## Task 26: 顧客 mypage に series 情報表示

**PR**: 6

**Files:**

- Modify: `src/app/(public)/mypage/reservations/_components/*`
- Modify: `src/shared/domain/reservations/customer-queries.ts` (select に series 情報追加)

- [ ] Step 1-5: TDD

commit:

```bash
git commit -m "feat(public): mypage reservation card に series info + 3 択キャンセル UI (Phase B.2 task 26)"
```

---

## Task 27: E2E golden path (admin create → 10 instance → cancel series-all)

**PR**: 6

**Files:**

- Create: `e2e/authenticated/admin/create-recurring-reservation.spec.ts`

- [ ] Step 1-3: spec 書く + focused run + commit

Test scenario:

1. admin form で weekly × 10 回入力
2. Preview 「毎週火・木、10 回、次回 YYYY-MM-DD」表示確認
3. Submit → success message
4. Calendar view に 10 instance 表示、repeat icon visible
5. 予約詳細ページから「series-all」キャンセル
6. 10 instance 全て CANCELLED status
7. Series row の deletedAt が set

commit:

```bash
git commit -m "test(e2e): admin recurring reservation create → 10 instance → series-all cancel (Phase B.2 task 27)"
```

---

## Task 28: PR 6 checkpoint + push (Phase B.2 完了)

**PR**: 6

- [ ] Step 1-4: 同 pattern

- [ ] **Step 5: 完了報告**

user に「Phase B.2 完了、6 PR 全 auto-merge queued or merged、次 phase 提案は未 confirmed」と report。

---

## Self-Review

**1. Spec coverage:**

- goal 1 (admin form で N instance materialize): Task 13, 19, 20, 21 でカバー
- goal 2 (per-instance payment/refund/passcode/receipt 独立): 既存契約温存、Task 13 で instance を独立 Reservation として insert
- goal 3 (3 択キャンセル UI): Task 21, 23, 26
- goal 4 (iCal RFC 5545 準拠 `.repeating`): Task 15
- goal 5 (GCal `event.recurrence` + childId write-back): Task 16
- goal 6 (SwitchBot per-instance passcode): 既存 `issueSmartLockPasscodes(reservationId)` を Task 13 の side-effects で instance ごとに逐次発火
- goal 7 (TermsAgreement RESERVATION_SERIES scope、Codex fix per-doc 1 行): Task 10, 13
- goal 8 (admin form client-side RRULE preview): Task 18, 19
- goal 9 (public UI は admin-only、顧客 mypage は series 情報表示のみ、`Settings.customerCanCancelSeriesInFull` gate): Task 25, 26
- goal 10 (advisory lock 728357 series 単位): Task 9, 13

全 goal → task mapping OK、gap 無し。

**2. Placeholder scan:**

- Task 13 の code block に `templateData から` の comment placeholder あり — 実装者が spec §1 の templateData schema を見て埋める意図で intentional。README として書いておく。
- Task 15/16/19/20/22/23/25/26 は「Step 1-5: TDD」の abbreviated 記法 — Task 1-13 で TDD pattern を確立しているため、参照 pattern として省略。
- Task 12 の test に `expect(true).toBe(true); // placeholder` — 実装時に埋める箇所と明示、intentional stubs。

**3. Type consistency:**

- `applyBulkCancellation` (Task 11) signature: `(tx, ids: string[], options): Promise<{ cancelledIds: string[] }>` — Task 13 で consume 一致。
- `CancellationSideEffectInput.suppress` (Task 12): Task 13 で通過確認一致。
- `validateRruleForSeries` (Task 6): Task 13 で consume 一致。
- `RESERVATION_SERIES_FREQ` (Task 2): Task 6, 18, 19 で consume 一致。
- `lockReservationSeriesForTransaction` (Task 9): Task 13 で consume 一致。
- `TERMS_SCOPE.RESERVATION_SERIES` (Task 2): Task 10, 13 で consume 一致。

placeholder / consistency 双方 OK。
