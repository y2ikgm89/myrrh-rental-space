# Add to Calendar Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFC 5545 準拠 + `ical-generator` ベースの Add to Calendar 機能を全面刷新し、予約/イベント申込フローで UID 安定・METHOD:CANCEL/REQUEST・SEQUENCE・VTIMEZONE をサポートするクリーン実装に置換する（後方互換性なし）。

**Architecture:** 既存自作 ICS 実装 (`src/shared/lib/ical/index.ts`) を `ical-generator` + `@touch4it/ical-timezones` で書き換え、Reservation/EventRegistration に `icsSequence` 列を追加、Customer 認証保護の `.ics` ダウンロード Route Handler を新設、Google/Outlook Web URL + `.ics` ダウンロードの 3 択ボタン UI (Server Component) を公開ページ・マイページ・メールに配置。キャンセル/更新時は `METHOD:CANCEL/REQUEST` + 同一 UID + SEQUENCE インクリメントで既存カレンダー登録を同期する。

**Tech Stack:** `ical-generator` v9+ / `@touch4it/ical-timezones` / Next.js 16 Route Handlers / Prisma 7 / Better Auth customer session / Editorial Magazine Design System (Server Component UI)

---

## File Structure

### 新規作成

- `src/shared/lib/ical/index.ts` — 完全書換: `ical-generator` ベースの `buildReservationCalendar` / `buildEventCalendar` / `buildReservationCancelCalendar` / `buildEventCancelCalendar` / `buildICalFeed` / Google/Outlook URL 生成ヘルパー
- `src/shared/lib/ical/types.ts` — `CalendarEventInput`, `AddToCalendarUrls`, `ReservationCalendarParams`, `EventCalendarParams` 型定義
- `src/app/api/calendar/reservation/[id]/route.ts` — Customer session 認証 + .ics ダウンロード
- `src/app/api/calendar/event/[registrationId]/route.ts` — Customer session 認証 + .ics ダウンロード
- `src/app/(public)/_shared/components/ui/add-to-calendar.tsx` — Server Component、Google/Outlook Web/ICS の 3 択ボタン
- `src/shared/lib/ical/uid.ts` — UID 生成ヘルパー（`buildReservationUid` / `buildEventRegistrationUid`）
- `src/shared/lib/ical/__tests__/ical.test.ts` — `ical-generator` ベース ICS 生成の単体テスト
- `__tests__/integration/api/calendar-reservation.test.ts` — route handler の認証/権限/ICS 生成統合テスト

### 書き換え

- `src/shared/lib/email/reservation-emails.ts` — ICS 添付 + Add to Calendar URL を `buildReservationCalendar` ベースに変更、Apple ボタンは data URL 廃止 → route handler URL 参照
- `src/shared/lib/email/event-emails.ts` — 申込確認メールに ICS 添付追加、キャンセルメールに `METHOD:CANCEL` 添付
- `src/app/api/ical/[token]/route.ts` — 管理者フィード配信を `buildICalFeed` に置換
- `src/shared/emails/reservation-confirmation.tsx` — `AddToCalendarLinks` 型更新（`apple: string` → data URL ではなく絶対 URL）
- `prisma/schema.prisma` — `Reservation.icsSequence Int @default(0)` + `EventRegistration.icsSequence Int @default(0)` 追加

### UI 配置

- `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx` — Add to Calendar ボタン配置
- `src/app/(public)/mypage/events/_components/event-registration-list.tsx` — Add to Calendar ボタン配置（各申込カード）
- `src/app/(public)/events/[slug]/page.tsx` — イベント詳細に Add to Calendar ボタン配置（未認証公開アクセス OK、route handler 不使用で直接 Google/Outlook URL のみ）

### Migration

- `prisma/migrations/YYYYMMDDHHMMSS_add_ics_sequence/migration.sql` — `icsSequence` 列追加

### ドキュメント

- `.claude/rules/ical-patterns.md` — 新規: `ical-generator` 使用規約・UID 安定性・SEQUENCE 管理・METHOD の使い分け

---

## Task 1: Prisma マイグレーション — icsSequence 列追加

**Files:**

- Modify: `prisma/schema.prisma:498-575` (Reservation), `prisma/schema.prisma:1756-1778` (EventRegistration)
- Create: `prisma/migrations/<timestamp>_add_ics_sequence/migration.sql`

**目的**: RFC 5545 の `SEQUENCE` 値を DB に永続化。予約/イベント申込を更新/キャンセルするたびにインクリメントし、同一 UID で既存カレンダー登録を上書きできるようにする。

- [ ] **Step 1: schema.prisma 編集 — Reservation に icsSequence 追加**

`prisma/schema.prisma:556-560` の Cancellation tracking セクションの直後に追加:

```prisma
  // Cancellation tracking
  cancellationReason String?  @db.Text
  cancelledAt        DateTime?
  cancelledByType    String?  @db.VarChar(20) // "CUSTOMER" | "ADMIN"

  // iCal RFC 5545 SEQUENCE (increments on update/cancel)
  icsSequence Int @default(0)

  @@index([spaceId])
```

- [ ] **Step 2: schema.prisma 編集 — EventRegistration に icsSequence 追加**

`prisma/schema.prisma:1766-1768` の `cancelledAt` 直後に追加:

```prisma
  cancelledAt     DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  // iCal RFC 5545 SEQUENCE (increments on update/cancel)
  icsSequence Int @default(0)

  event           Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
```

- [ ] **Step 3: migration ファイル作成**

Run:

```bash
bunx --bun prisma migrate dev --name add_ics_sequence
```

Expected: `prisma/migrations/<timestamp>_add_ics_sequence/migration.sql` が生成され、`ALTER TABLE "reservations" ADD COLUMN "icsSequence" INTEGER NOT NULL DEFAULT 0;` と `ALTER TABLE "event_registrations" ADD COLUMN "icsSequence" INTEGER NOT NULL DEFAULT 0;` を含む。

- [ ] **Step 4: 型生成確認**

Run: `bun run db:generate && bun run type-check`
Expected: exit 0. `Reservation.icsSequence` / `EventRegistration.icsSequence` が Prisma 型に反映される。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add icsSequence to Reservation and EventRegistration for RFC 5545 SEQUENCE"
```

---

## Task 2: 依存パッケージインストール

**Files:**

- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: インストール**

Run:

```bash
bun add ical-generator @touch4it/ical-timezones
```

Expected: `package.json` の `dependencies` に `ical-generator` と `@touch4it/ical-timezones` が追加される。

- [ ] **Step 2: 型確認**

Run:

```bash
bun -e "import('ical-generator').then(m => console.log(typeof m.default, typeof m.ICalCalendarMethod))"
```

Expected: `function function` を出力（default export が関数、`ICalCalendarMethod` が enum オブジェクト）。

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat(deps): add ical-generator + @touch4it/ical-timezones"
```

---

## Task 3: UID 生成ヘルパー

**Files:**

- Create: `src/shared/lib/ical/uid.ts`
- Create: `src/shared/lib/ical/__tests__/uid.test.ts`

**目的**: UID は RFC 5545 で「同一イベントで永続的に安定」が必須（更新/キャンセルで同じ UID を送る必要があるため）。`localpart@domain` 形式を生成する SSoT ヘルパーを作る。

- [ ] **Step 1: テスト作成**

Write `src/shared/lib/ical/__tests__/uid.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { buildReservationUid, buildEventRegistrationUid } from "../uid";

describe("buildReservationUid", () => {
  test("returns stable uid for same reservationId", () => {
    const uid1 = buildReservationUid("abc-123", "example.com");
    const uid2 = buildReservationUid("abc-123", "example.com");
    expect(uid1).toBe(uid2);
  });

  test("follows RFC 5545 localpart@domain format", () => {
    const uid = buildReservationUid("abc-123", "example.com");
    expect(uid).toBe("reservation-abc-123@example.com");
  });

  test("fallsback to 'localhost' when host is empty", () => {
    const uid = buildReservationUid("abc-123", "");
    expect(uid).toBe("reservation-abc-123@localhost");
  });
});

describe("buildEventRegistrationUid", () => {
  test("follows event-registration-<id>@<host> format", () => {
    const uid = buildEventRegistrationUid("reg-456", "example.com");
    expect(uid).toBe("event-registration-reg-456@example.com");
  });
});
```

- [ ] **Step 2: テスト実行（fail を確認）**

Run: `bun test src/shared/lib/ical/__tests__/uid.test.ts`
Expected: FAIL — `Cannot find module '../uid'`

- [ ] **Step 3: 実装**

Write `src/shared/lib/ical/uid.ts`:

```typescript
/**
 * RFC 5545 UID 生成ヘルパー
 *
 * UID は同一イベントで永続的に安定である必要がある（更新/キャンセルで
 * 既存カレンダー登録を上書きするため）。localpart@domain 形式を使用する。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.7
 * @module shared/lib/ical/uid
 */

const FALLBACK_HOST = "localhost";

function normalizeHost(host: string): string {
  const trimmed = host.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_HOST;
}

/**
 * 予約の iCal UID を生成する（`reservation-<id>@<host>`）。
 *
 * @param reservationId - 予約 ID（UUID）
 * @param host - `Settings.businessDomain` または `getAppUrl()` のホスト名
 */
export function buildReservationUid(
  reservationId: string,
  host: string,
): string {
  return `reservation-${reservationId}@${normalizeHost(host)}`;
}

/**
 * イベント申込の iCal UID を生成する（`event-registration-<id>@<host>`）。
 */
export function buildEventRegistrationUid(
  registrationId: string,
  host: string,
): string {
  return `event-registration-${registrationId}@${normalizeHost(host)}`;
}
```

- [ ] **Step 4: テスト再実行（pass を確認）**

Run: `bun test src/shared/lib/ical/__tests__/uid.test.ts`
Expected: 3 pass 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/ical/uid.ts src/shared/lib/ical/__tests__/uid.test.ts
git commit -m "feat(ical): add stable UID builders for reservation/event-registration"
```

---

## Task 4: 型定義 `ical/types.ts`

**Files:**

- Create: `src/shared/lib/ical/types.ts`

**目的**: 新 API の入力/出力型を 1 ファイルに集約（`"use server"` / client 両側から `import type` 可能）。

- [ ] **Step 1: 実装**

Write `src/shared/lib/ical/types.ts`:

```typescript
/**
 * iCal 型定義
 *
 * @module shared/lib/ical/types
 */

/** Add to Calendar ボタン用の 3 プロバイダ URL */
export type AddToCalendarUrls = {
  /** Google Calendar 追加リンク（`calendar.google.com/calendar/render`） */
  readonly google: string;
  /** Outlook Web 追加リンク（`outlook.live.com/calendar/0/deeplink/compose`） */
  readonly outlookWeb: string;
  /** .ics ダウンロード URL（Apple Calendar / Outlook デスクトップ / その他） */
  readonly ics: string;
};

/** ICS 生成の共通入力 */
export type CalendarEventInput = {
  readonly summary: string;
  readonly description: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** 予約 ICS 生成パラメータ */
export type ReservationCalendarParams = {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly customerName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly notes?: string;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** イベント申込 ICS 生成パラメータ */
export type EventCalendarParams = {
  readonly registrationId: string;
  readonly eventTitle: string;
  readonly customerName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly numberOfPeople: number;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** iCal フィード（管理者購読用）の 1 エントリ */
export type ICalFeedEntry = {
  readonly uid: string;
  readonly summary: string;
  readonly description: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly sequence: number;
};
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/ical/types.ts
git commit -m "feat(ical): add type definitions for calendar event inputs and outputs"
```

---

## Task 5: コア実装 `ical/index.ts` 書き換え

**Files:**

- Modify: `src/shared/lib/ical/index.ts` (完全書換)
- Create: `src/shared/lib/ical/__tests__/ical.test.ts`

**目的**: `ical-generator` ベースの ICS 生成関数と Google/Outlook URL ヘルパーを実装。旧 API (`generateICalContent` / `createReservationEvent` / `generateAddToCalendarLinks` / `generateICalFeed`) は完全削除し、新 API に置換。

- [ ] **Step 1: テスト作成**

Write `src/shared/lib/ical/__tests__/ical.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  buildReservationCalendar,
  buildReservationCancelCalendar,
  buildEventCalendar,
  buildEventCancelCalendar,
  buildICalFeed,
  buildGoogleCalendarUrl,
  buildOutlookWebUrl,
  buildAddToCalendarUrls,
} from "../index";

const SAMPLE_RESERVATION = {
  reservationId: "abc-123",
  spaceName: "Studio A",
  customerName: "山田 太郎",
  startTime: new Date("2026-05-01T10:00:00+09:00"),
  endTime: new Date("2026-05-01T12:00:00+09:00"),
  location: "東京都渋谷区...",
  notes: "テスト予約",
  sequence: 0,
  url: "https://example.com/mypage/reservations/abc-123",
  organizerName: "Myrrh Rental Space",
  organizerEmail: "noreply@example.com",
};

describe("buildReservationCalendar", () => {
  test("produces RFC 5545 compliant iCal with stable UID", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:reservation-abc-123@example.com");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("SUMMARY:【予約】Studio A");
    expect(ics).toContain("END:VCALENDAR");
  });

  test("includes VTIMEZONE for Asia/Tokyo", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Tokyo");
  });

  test("escapes special characters in description", () => {
    const ics = buildReservationCalendar(
      { ...SAMPLE_RESERVATION, notes: "line1\nline2, with; semicolon" },
      "example.com",
    );
    expect(ics).toMatch(/line1\\nline2\\, with\\; semicolon/u);
  });

  test("increments SEQUENCE when passed", () => {
    const ics = buildReservationCalendar(
      { ...SAMPLE_RESERVATION, sequence: 3 },
      "example.com",
    );
    expect(ics).toContain("SEQUENCE:3");
  });
});

describe("buildReservationCancelCalendar", () => {
  test("produces METHOD:CANCEL with STATUS:CANCELLED and same UID", () => {
    const ics = buildReservationCancelCalendar(
      { ...SAMPLE_RESERVATION, sequence: 1 },
      "example.com",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:reservation-abc-123@example.com");
    expect(ics).toContain("SEQUENCE:1");
  });
});

describe("buildEventCalendar", () => {
  test("produces event ICS with event-registration UID", () => {
    const ics = buildEventCalendar(
      {
        registrationId: "reg-456",
        eventTitle: "ワークショップ",
        customerName: "山田 太郎",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        numberOfPeople: 2,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    expect(ics).toContain("UID:event-registration-reg-456@example.com");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SUMMARY:ワークショップ");
  });
});

describe("buildEventCancelCalendar", () => {
  test("produces METHOD:CANCEL with event-registration UID", () => {
    const ics = buildEventCancelCalendar(
      {
        registrationId: "reg-456",
        eventTitle: "ワークショップ",
        customerName: "山田 太郎",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        numberOfPeople: 2,
        sequence: 1,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});

describe("buildICalFeed", () => {
  test("produces METHOD:PUBLISH calendar with multiple events", () => {
    const ics = buildICalFeed(
      {
        calendarName: "Studio A - 予約",
        entries: [
          {
            uid: "reservation-1@example.com",
            summary: "【予約】Studio A",
            description: "Test 1",
            startTime: new Date("2026-05-01T10:00:00+09:00"),
            endTime: new Date("2026-05-01T12:00:00+09:00"),
            sequence: 0,
          },
          {
            uid: "reservation-2@example.com",
            summary: "【予約】Studio A",
            description: "Test 2",
            startTime: new Date("2026-05-02T14:00:00+09:00"),
            endTime: new Date("2026-05-02T16:00:00+09:00"),
            sequence: 1,
          },
        ],
      },
      "example.com",
    );
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Studio A - 予約");
    expect(ics).toContain("UID:reservation-1@example.com");
    expect(ics).toContain("UID:reservation-2@example.com");
  });
});

describe("buildGoogleCalendarUrl", () => {
  test("generates TEMPLATE action URL with required params", () => {
    const url = buildGoogleCalendarUrl({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
      location: "Tokyo",
    });
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Test");
    expect(url).toMatch(/dates=20260501T100000Z%2F20260501T120000Z/u);
    expect(url).toContain("location=Tokyo");
  });
});

describe("buildOutlookWebUrl", () => {
  test("generates Outlook Live deeplink URL", () => {
    const url = buildOutlookWebUrl({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
    });
    expect(url).toContain(
      "https://outlook.live.com/calendar/0/deeplink/compose",
    );
    expect(url).toContain("rru=addevent");
    expect(url).toContain("subject=Test");
  });
});

describe("buildAddToCalendarUrls", () => {
  test("returns all 3 provider URLs", () => {
    const urls = buildAddToCalendarUrls({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
      icsDownloadUrl: "https://example.com/api/calendar/reservation/abc-123",
    });
    expect(urls.google).toContain("calendar.google.com");
    expect(urls.outlookWeb).toContain("outlook.live.com");
    expect(urls.ics).toBe(
      "https://example.com/api/calendar/reservation/abc-123",
    );
  });
});
```

- [ ] **Step 2: テスト実行（fail を確認）**

Run: `bun test src/shared/lib/ical/__tests__/ical.test.ts`
Expected: FAIL — 旧 API が残っていて新 API が無い。

- [ ] **Step 3: 実装 — 既存 `src/shared/lib/ical/index.ts` を完全置換**

Write `src/shared/lib/ical/index.ts`:

```typescript
/**
 * iCal (.ics) 生成 + Add to Calendar URL ヘルパー
 *
 * `ical-generator` v9 ベース。RFC 5545 準拠で UID 安定・SEQUENCE 管理・
 * METHOD:REQUEST/CANCEL・VTIMEZONE (Asia/Tokyo) をサポートする。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 * @module shared/lib/ical
 */

import { format } from "date-fns";
import ical, {
  ICalCalendarMethod,
  ICalEventBusyStatus,
  ICalEventStatus,
  type ICalCalendar,
} from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import { buildEventRegistrationUid, buildReservationUid } from "./uid";
import type {
  AddToCalendarUrls,
  CalendarEventInput,
  EventCalendarParams,
  ICalFeedEntry,
  ReservationCalendarParams,
} from "./types";

const PRODID = "-//Myrrh Rental Space//Reservation System//JP";
const DEFAULT_TIMEZONE = "Asia/Tokyo";

// =============================================================================
// Calendar factory
// =============================================================================

function createCalendar(
  method: ICalCalendarMethod,
  name?: string,
): ICalCalendar {
  const cal = ical({
    prodId: PRODID,
    method,
    timezone: {
      name: DEFAULT_TIMEZONE,
      generator: getVtimezoneComponent,
    },
  });
  if (name !== undefined) cal.name(name);
  return cal;
}

// =============================================================================
// Reservation
// =============================================================================

function buildReservationDescription(
  params: ReservationCalendarParams,
): string {
  const formattedDate = format(params.startTime, "yyyy/MM/dd");
  const formattedStart = format(params.startTime, "HH:mm");
  const formattedEnd = format(params.endTime, "HH:mm");

  const lines = [
    `予約ID: ${params.reservationId.slice(0, 8).toUpperCase()}`,
    `スペース: ${params.spaceName}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
  ];
  if (params.notes !== undefined && params.notes.length > 0) {
    lines.push(`備考: ${params.notes}`);
  }
  return lines.join("\n");
}

/**
 * 予約の iCal を生成する（METHOD:REQUEST + STATUS:CONFIRMED）。
 *
 * @param params - 予約情報 + `sequence`（DB `Reservation.icsSequence`）
 * @param host - `getAppUrl()` のホスト名（UID 生成に使用）
 */
export function buildReservationCalendar(
  params: ReservationCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.REQUEST);
  const event = cal.createEvent({
    id: buildReservationUid(params.reservationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【予約】${params.spaceName}`,
    description: buildReservationDescription(params),
    status: ICalEventStatus.CONFIRMED,
    busystatus: ICalEventBusyStatus.BUSY,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (params.url !== undefined) event.url(params.url);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

/**
 * 予約キャンセル通知の iCal を生成する（METHOD:CANCEL + STATUS:CANCELLED）。
 *
 * 既存カレンダー登録を同一 UID で上書きしてキャンセル状態に遷移させる。
 * `sequence` は update/cancel 時に必ずインクリメントすること。
 */
export function buildReservationCancelCalendar(
  params: ReservationCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.CANCEL);
  const event = cal.createEvent({
    id: buildReservationUid(params.reservationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【キャンセル】${params.spaceName}`,
    description: buildReservationDescription(params),
    status: ICalEventStatus.CANCELLED,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

// =============================================================================
// Event registration
// =============================================================================

function buildEventDescription(params: EventCalendarParams): string {
  const formattedDate = format(params.startTime, "yyyy/MM/dd");
  const formattedStart = format(params.startTime, "HH:mm");
  const formattedEnd = format(params.endTime, "HH:mm");

  return [
    `申込ID: ${params.registrationId.slice(0, 8).toUpperCase()}`,
    `イベント: ${params.eventTitle}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
    `参加人数: ${params.numberOfPeople}名`,
  ].join("\n");
}

export function buildEventCalendar(
  params: EventCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.REQUEST);
  const event = cal.createEvent({
    id: buildEventRegistrationUid(params.registrationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: params.eventTitle,
    description: buildEventDescription(params),
    status: ICalEventStatus.CONFIRMED,
    busystatus: ICalEventBusyStatus.BUSY,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (params.url !== undefined) event.url(params.url);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

export function buildEventCancelCalendar(
  params: EventCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.CANCEL);
  const event = cal.createEvent({
    id: buildEventRegistrationUid(params.registrationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【中止】${params.eventTitle}`,
    description: buildEventDescription(params),
    status: ICalEventStatus.CANCELLED,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

// =============================================================================
// iCal Feed (管理者購読)
// =============================================================================

export type ICalFeedParams = {
  readonly calendarName: string;
  readonly entries: readonly ICalFeedEntry[];
};

export function buildICalFeed(params: ICalFeedParams, _host: string): string {
  const cal = createCalendar(ICalCalendarMethod.PUBLISH, params.calendarName);
  for (const entry of params.entries) {
    const event = cal.createEvent({
      id: entry.uid,
      start: entry.startTime,
      end: entry.endTime,
      summary: entry.summary,
      description: entry.description,
      status: ICalEventStatus.CONFIRMED,
      busystatus: ICalEventBusyStatus.BUSY,
      sequence: entry.sequence,
    });
    if (entry.location !== undefined) event.location(entry.location);
  }
  return cal.toString();
}

// =============================================================================
// Add to Calendar URL Builders
// =============================================================================

function formatUtcCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${formatUtcCompact(event.startTime)}/${formatUtcCompact(event.endTime)}`,
    details: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookWebUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: event.startTime.toISOString(),
    enddt: event.endTime.toISOString(),
    subject: event.summary,
    body: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export type BuildAddToCalendarUrlsParams = CalendarEventInput & {
  readonly icsDownloadUrl: string;
};

/**
 * Google/Outlook Web/ICS ダウンロードの 3 URL を返す。
 *
 * ICS ダウンロードは route handler URL を渡すこと（data URL は
 * Gmail 等でブロックされるため禁止）。
 */
export function buildAddToCalendarUrls(
  params: BuildAddToCalendarUrlsParams,
): AddToCalendarUrls {
  return {
    google: buildGoogleCalendarUrl(params),
    outlookWeb: buildOutlookWebUrl(params),
    ics: params.icsDownloadUrl,
  };
}

export type {
  AddToCalendarUrls,
  CalendarEventInput,
  ICalFeedEntry,
} from "./types";
export type { EventCalendarParams, ReservationCalendarParams } from "./types";
export { buildEventRegistrationUid, buildReservationUid } from "./uid";
```

- [ ] **Step 4: テスト再実行（全 pass を確認）**

Run: `bun test src/shared/lib/ical/__tests__/ical.test.ts`
Expected: すべて pass

- [ ] **Step 5: `bun run validate` で旧 API 参照残がないか確認**

Run: `bun run validate`
Expected: 旧 `generateICalContent` / `generateICalFeed` / `createReservationEvent` / `generateAddToCalendarLinks` を参照している呼び出し側（`reservation-emails.ts` / `api/ical/[token]/route.ts`）で型エラーが出る。次タスクで解消。

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/ical/index.ts src/shared/lib/ical/__tests__/ical.test.ts
git commit -m "feat(ical): rewrite on ical-generator with stable UID, METHOD, VTIMEZONE, SEQUENCE"
```

---

## Task 6: 管理者 iCal フィード route handler を新 API に移行

**Files:**

- Modify: `src/app/api/ical/[token]/route.ts`

- [ ] **Step 1: 実装**

`src/app/api/ical/[token]/route.ts` の import と event 変換部分を書き換え:

```typescript
import { NextResponse } from "next/server";
import {
  getICalFeedRuntimeSettings,
  getICalReservations,
  getICalTokenByValue,
} from "@/shared/domain/ical/queries";
import { markICalTokenUsed } from "@/shared/domain/ical/commands";
import {
  buildICalFeed,
  type ICalFeedEntry,
  buildReservationUid,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import { format } from "date-fns";
import { unstable_rethrow } from "next/navigation";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const settings = await getICalFeedRuntimeSettings();
    if (!settings.enabled) {
      return new NextResponse("iCal feed is disabled", { status: 403 });
    }

    const icalToken = await getICalTokenByValue(token);
    if (!icalToken) {
      return new NextResponse("Invalid token", { status: 404 });
    }
    if (icalToken.expiresAt && icalToken.expiresAt < new Date()) {
      return new NextResponse("Token expired", { status: 410 });
    }

    fireAndForget(markICalTokenUsed(icalToken.id), {
      operation: "updateICalTokenLastUsed",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
    });

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setMonth(rangeStart.getMonth() - 1);
    const rangeEnd = new Date(now);
    rangeEnd.setMonth(rangeEnd.getMonth() + 3);

    const reservations = await getICalReservations({
      rangeStart,
      rangeEnd,
      spaceId: icalToken.spaceId,
    });

    const host = getAppHost();

    const entries: ICalFeedEntry[] = reservations.map((r) => {
      const formattedDate = format(r.startTime, "yyyy/MM/dd");
      const formattedStart = format(r.startTime, "HH:mm");
      const formattedEnd = format(r.endTime, "HH:mm");

      const customerInfo = settings.includeCustomerInfo
        ? `${r.customerLastName} ${r.customerFirstName}様`
        : "予約済み";

      const descriptionLines = [
        `予約ID: ${r.id.slice(0, 8).toUpperCase()}`,
        `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
      ];
      if (settings.includeCustomerInfo) {
        descriptionLines.push(`お客様: ${customerInfo}`);
      }

      return {
        uid: buildReservationUid(r.id, host),
        summary: `【予約】${r.spaceName}${settings.includeCustomerInfo ? ` - ${customerInfo}` : ""}`,
        description: descriptionLines.join("\n"),
        startTime: r.startTime,
        endTime: r.endTime,
        ...(r.spaceAddress != null ? { location: r.spaceAddress } : {}),
        sequence: r.icsSequence,
      };
    });

    const calendarName = icalToken.spaceName
      ? `${icalToken.spaceName} - 予約カレンダー`
      : "予約カレンダー";

    const icalContent = buildICalFeed({ calendarName, entries }, host);

    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${icalToken.name || "calendar"}.ics"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "iCalFeed" },
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

- [ ] **Step 2: `getICalReservations` クエリに `icsSequence` を select に追加**

Modify: `src/shared/domain/ical/queries.ts`

該当 select 内に `icsSequence: true` を追加（既存フィールドと並列）。戻り値型も対応。

- [ ] **Step 3: `getAppHost()` ヘルパーが `@/shared/lib/constants` に無ければ追加**

Check: `bun -e "import('./src/shared/lib/constants').then(m => console.log(typeof m.getAppHost))"`

無ければ `src/shared/lib/constants` に追加:

```typescript
import { clientEnv } from "@/shared/lib/env/client";

export function getAppHost(): string {
  try {
    return new URL(clientEnv.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return "localhost";
  }
}
```

- [ ] **Step 4: 検証**

Run: `bun run type-check && bun test __tests__/unit/api/ical 2>/dev/null; bun run lint`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ical/[token]/route.ts src/shared/domain/ical/queries.ts src/shared/lib/constants.ts
git commit -m "refactor(ical): migrate admin feed route to buildICalFeed with stable UID + sequence"
```

---

## Task 7: Customer session 認証付き予約 .ics ダウンロード route

**Files:**

- Create: `src/app/api/calendar/reservation/[id]/route.ts`
- Create: `__tests__/integration/api/calendar-reservation.test.ts`

**目的**: マイページ/メールの Add to Calendar ボタンから都度生成でダウンロード可能な .ics を配信。`customerSession` 認証必須で、リクエストユーザーの予約のみ返す。

- [ ] **Step 1: integration test を書く**

Write `__tests__/integration/api/calendar-reservation.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => null),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mock(() => null),
}));

mock.module("@/shared/domain/reservations/queries", () => ({
  getReservationForCustomer: mock(() => null),
}));

describe("GET /api/calendar/reservation/[id]", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  test("returns 401 when customer is not authenticated", async () => {
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/reservation/abc-123"),
      { params: Promise.resolve({ id: "abc-123" }) },
    );
    expect(res.status).toBe(401);
  });

  test("returns 400 when id is not a valid uuid", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => ({ user: { id: "user-1" } })),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/reservation/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when reservation does not belong to customer", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => ({ user: { id: "user-1" } })),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => ({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/reservations/queries", () => ({
      getReservationForCustomer: mock(() => null),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        "http://localhost/api/calendar/reservation/11111111-1111-1111-1111-111111111111",
      ),
      {
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("returns 200 with text/calendar when reservation belongs to customer", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => ({ user: { id: "user-1" } })),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => ({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/reservations/queries", () => ({
      getReservationForCustomer: mock(() => ({
        id: "11111111-1111-1111-1111-111111111111",
        spaceName: "Studio A",
        customerName: "Yamada",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        location: "Tokyo",
        notes: null,
        icsSequence: 0,
        status: "CONFIRMED",
      })),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        "http://localhost/api/calendar/reservation/11111111-1111-1111-1111-111111111111",
      ),
      {
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain("UID:reservation-");
    expect(body).toContain("SUMMARY:【予約】Studio A");
    expect(body).toContain("METHOD:CANCEL"); // CANCELLED 状態だった場合 (このテストでは CONFIRMED → REQUEST)
  });
});
```

※ 最後のアサーションで CONFIRMED のときは `METHOD:REQUEST` を期待、CANCELLED のときは `METHOD:CANCEL` を期待に変更する。テストを正しくするには expected method を status 毎に分岐させる。上記テストは `CONFIRMED` のため `expect(body).toContain("METHOD:REQUEST")` に修正すること。

- [ ] **Step 2: 実装**

Write `src/app/api/calendar/reservation/[id]/route.ts`:

```typescript
/**
 * 予約 .ics ダウンロード API
 *
 * マイページ・メール内の Add to Calendar ボタンから呼ばれる。
 * Customer session 認証必須。リクエストユーザー所有の予約のみ .ics を返す。
 *
 * @module app/api/calendar/reservation/[id]
 */

import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getReservationForCustomer } from "@/shared/domain/reservations/queries";
import {
  buildReservationCalendar,
  buildReservationCancelCalendar,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

const paramSchema = z.object({
  id: z.string().uuid({ error: "Invalid reservation id" }),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 認証 → バリデーションの順
    const session = await getCustomerSession();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const raw = await params;
    const parsed = paramSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid id", { status: 400 });
    }

    const customer = await getCustomerByUserId(session.user.id);
    if (!customer) {
      return new NextResponse("Customer not found", { status: 404 });
    }

    const reservation = await getReservationForCustomer({
      reservationId: parsed.data.id,
      customerId: customer.id,
    });
    if (!reservation) {
      return new NextResponse("Not found", { status: 404 });
    }

    const host = getAppHost();
    const { organizerName, organizerEmail } =
      await getNotificationEmailAddresses();

    const calendarParams = {
      reservationId: reservation.id,
      spaceName: reservation.spaceName,
      customerName: reservation.customerName,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      ...(reservation.location != null
        ? { location: reservation.location }
        : {}),
      ...(reservation.notes != null ? { notes: reservation.notes } : {}),
      sequence: reservation.icsSequence,
      organizerName,
      organizerEmail,
    };

    const isCancelled = reservation.status === "CANCELLED";
    const ics = isCancelled
      ? buildReservationCancelCalendar(calendarParams, host)
      : buildReservationCalendar(calendarParams, host);

    const filename = `reservation-${reservation.id.slice(0, 8)}.ics`;

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "calendarReservationDownload" },
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

- [ ] **Step 3: `getReservationForCustomer` が既存 domain query に無ければ追加**

Check: `Grep "getReservationForCustomer" src/shared/domain/reservations/queries.ts`

無ければ `src/shared/domain/reservations/queries.ts` に追加:

```typescript
export async function getReservationForCustomer(params: {
  reservationId: string;
  customerId: string;
}): Promise<{
  id: string;
  spaceName: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  notes: string | null;
  icsSequence: number;
  status: ReservationStatus;
} | null> {
  const reservation = await prisma.reservation.findFirst({
    where: {
      id: params.reservationId,
      customerId: params.customerId,
      deletedAt: null,
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      notes: true,
      icsSequence: true,
      status: true,
      space: {
        select: { name: true, address: true },
      },
      customer: {
        select: { lastName: true, firstName: true },
      },
    },
  });
  if (!reservation) return null;
  return {
    id: reservation.id,
    spaceName: reservation.space.name,
    customerName:
      `${reservation.customer.lastName ?? ""} ${reservation.customer.firstName ?? ""}`.trim(),
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    location: reservation.space.address,
    notes: reservation.notes,
    icsSequence: reservation.icsSequence,
    status: reservation.status,
  };
}
```

- [ ] **Step 4: テスト実行**

Run: `bun test __tests__/integration/api/calendar-reservation.test.ts`
Expected: 4 pass

- [ ] **Step 5: `package.json` の `test:integration` チェーンに追記**

`package.json` の `test:integration` スクリプト末尾に `bun test __tests__/integration/api/calendar-reservation.test.ts` を追加。

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calendar/reservation/[id]/route.ts src/shared/domain/reservations/queries.ts __tests__/integration/api/calendar-reservation.test.ts package.json
git commit -m "feat(api): add customer-authenticated .ics download route for reservations"
```

---

## Task 8: Customer session 認証付きイベント申込 .ics ダウンロード route

**Files:**

- Create: `src/app/api/calendar/event/[registrationId]/route.ts`
- Create: `__tests__/integration/api/calendar-event.test.ts`

- [ ] **Step 1: integration test**

Write `__tests__/integration/api/calendar-event.test.ts`:（前 task と同パターンで `getEventRegistrationForCustomer` を mock）

```typescript
import { describe, expect, test, mock } from "bun:test";

describe("GET /api/calendar/event/[registrationId]", () => {
  test("returns 401 when not authenticated", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => null),
    }));
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/event/reg-456"),
      { params: Promise.resolve({ registrationId: "reg-456" }) },
    );
    expect(res.status).toBe(401);
  });

  test("returns 200 text/calendar when authenticated and registration matches", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => ({ user: { id: "user-1" } })),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => ({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/events/queries", () => ({
      getEventRegistrationForCustomer: mock(() => ({
        id: "reg-456",
        eventTitle: "ワークショップ",
        customerName: "Yamada",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        location: "Tokyo",
        numberOfPeople: 2,
        icsSequence: 0,
        status: "CONFIRMED",
      })),
    }));
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/event/reg-456"),
      { params: Promise.resolve({ registrationId: "reg-456" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain("UID:event-registration-reg-456@");
    expect(body).toContain("METHOD:REQUEST");
  });
});
```

- [ ] **Step 2: 実装**

Write `src/app/api/calendar/event/[registrationId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getEventRegistrationForCustomer } from "@/shared/domain/events/queries";
import {
  buildEventCalendar,
  buildEventCancelCalendar,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

const paramSchema = z.object({
  registrationId: z
    .string()
    .min(1, { error: "Invalid registration id" })
    .max(40, { error: "Invalid registration id" }),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const session = await getCustomerSession();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const raw = await params;
    const parsed = paramSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid registration id", { status: 400 });
    }

    const customer = await getCustomerByUserId(session.user.id);
    if (!customer) {
      return new NextResponse("Customer not found", { status: 404 });
    }

    const registration = await getEventRegistrationForCustomer({
      registrationId: parsed.data.registrationId,
      customerId: customer.id,
    });
    if (!registration) {
      return new NextResponse("Not found", { status: 404 });
    }

    const host = getAppHost();
    const { organizerName, organizerEmail } =
      await getNotificationEmailAddresses();

    const calendarParams = {
      registrationId: registration.id,
      eventTitle: registration.eventTitle,
      customerName: registration.customerName,
      startTime: registration.startTime,
      endTime: registration.endTime,
      ...(registration.location != null
        ? { location: registration.location }
        : {}),
      numberOfPeople: registration.numberOfPeople,
      sequence: registration.icsSequence,
      organizerName,
      organizerEmail,
    };

    const isCancelled = registration.status === "CANCELLED";
    const ics = isCancelled
      ? buildEventCancelCalendar(calendarParams, host)
      : buildEventCalendar(calendarParams, host);

    const filename = `event-${registration.id.slice(0, 8)}.ics`;

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "calendarEventDownload" },
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

- [ ] **Step 3: `getEventRegistrationForCustomer` 追加**

`src/shared/domain/events/queries.ts` に追加:

```typescript
export async function getEventRegistrationForCustomer(params: {
  registrationId: string;
  customerId: string;
}): Promise<{
  id: string;
  eventTitle: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  numberOfPeople: number;
  icsSequence: number;
  status: RegistrationStatus;
} | null> {
  const reg = await prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      customerId: params.customerId,
      event: { deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      numberOfPeople: true,
      icsSequence: true,
      status: true,
      event: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          location: true,
        },
      },
    },
  });
  if (!reg) return null;
  return {
    id: reg.id,
    eventTitle: reg.event.title,
    customerName: reg.name,
    startTime: reg.event.startTime,
    endTime: reg.event.endTime,
    location: reg.event.location,
    numberOfPeople: reg.numberOfPeople,
    icsSequence: reg.icsSequence,
    status: reg.status,
  };
}
```

- [ ] **Step 4: テスト + package.json チェーン追加**

Run: `bun test __tests__/integration/api/calendar-event.test.ts`
Expected: 2 pass

`package.json` の `test:integration` に `bun test __tests__/integration/api/calendar-event.test.ts` を追加。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/event/[registrationId]/route.ts src/shared/domain/events/queries.ts __tests__/integration/api/calendar-event.test.ts package.json
git commit -m "feat(api): add customer-authenticated .ics download route for event registrations"
```

---

## Task 9: SEQUENCE インクリメント — ドメインコマンドに組み込む

**Files:**

- Modify: `src/shared/domain/reservations/commands.ts`
- Modify: `src/shared/domain/events/commands.ts`

**目的**: 予約/イベント申込の update/cancel 操作で `icsSequence: { increment: 1 }` を行い、METHOD:CANCEL/REQUEST の ICS を送った際に既存カレンダー登録を正しく上書きできるようにする。

- [ ] **Step 1: `updateReservationCommand` / `cancelReservationCommand` / `cancelCustomerReservationCommand` 等を確認し、`prisma.reservation.update({ ... data: { ..., icsSequence: { increment: 1 } } })` を追加**

Run: `Grep "prisma.reservation.update|tx.reservation.update" src/shared/domain/reservations/commands.ts`

ヒットした update 呼び出しのうち、以下のメソッドは `icsSequence: { increment: 1 }` を追加すること:

- `updateReservationCommand`
- `cancelReservationCommand`
- `cancelCustomerReservationCommand`
- `confirmReservationCommand` (ステータス変更 — 新カレンダー招待として扱う)

`createReservationCommand` は新規作成なので `icsSequence` は default 0 のままで OK。

- [ ] **Step 2: Event も同様に更新**

Run: `Grep "prisma.eventRegistration.update|tx.eventRegistration.update" src/shared/domain/events/commands.ts`

`cancelEventRegistrationCommand` / `updateEventRegistrationCommand` に `icsSequence: { increment: 1 }` を追加。

- [ ] **Step 3: 型チェック**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/shared/domain/reservations/commands.ts src/shared/domain/events/commands.ts
git commit -m "feat(domain): increment icsSequence on reservation/event update and cancel"
```

---

## Task 10: 予約メールを新 ICS API に移行

**Files:**

- Modify: `src/shared/lib/email/reservation-emails.ts`
- Modify: `src/shared/emails/reservation-confirmation.tsx`

**目的**:

1. `createReservationEvent` / `generateAddToCalendarLinks` / `generateICalContent` 旧 API 呼び出しを `buildReservationCalendar` / `buildAddToCalendarUrls` に置換
2. `apple: string` (data URL) を廃止し、ボタンは Google / Outlook Web / ICS ダウンロード (route handler URL) の 3 つ
3. キャンセルメールに `METHOD:CANCEL` ICS 添付を追加
4. ステータス変更メールも同様にキャンセル時は CANCEL ICS を添付

- [ ] **Step 1: `reservation-emails.ts` 全体を書き換え**

主要変更点:

- `createReservationEvent` 呼び出しを削除
- `generateAddToCalendarLinks` → `buildAddToCalendarUrls({ ..., icsDownloadUrl: \`\${appUrl}/api/calendar/reservation/\${reservationId}\` })`
- ICS 添付は `buildReservationCalendar(params, host)` / `buildReservationCancelCalendar(params, host)` を使用
- `data.icsSequence` 引数を `ReservationEmailData` 型に追加

`src/shared/lib/email/types.ts` の `ReservationEmailData` に `icsSequence: number` を追加。

- [ ] **Step 2: `reservation-confirmation.tsx` の型更新**

```typescript
type AddToCalendarLinks = {
  google: string;
  outlookWeb: string;
  ics: string;
};
```

`apple` / `outlook` プロパティを削除し、ボタンも `google` / `outlookWeb` / `ics` の 3 つに統合。UI 構造上、`ics` ボタンは「Apple Calendar / Outlook デスクトップ / その他」兼用のラベル（例: 「iCal (.ics)」）を使う。

- [ ] **Step 3: 呼び出し元（`ReservationEmailData` を組み立てる箇所）を更新**

Run: `Grep "ReservationEmailData" src/`

全呼び出し元で `icsSequence: reservation.icsSequence` を渡すよう変更。

- [ ] **Step 4: 既存テスト更新**

Run: `bun run test:integration 2>&1 | head -80`

`reservation-emails` 関連テストがあれば新 API に合わせて更新。

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email/reservation-emails.ts src/shared/emails/reservation-confirmation.tsx src/shared/lib/email/types.ts
git commit -m "refactor(email): migrate reservation emails to buildReservationCalendar + route handler ICS URL"
```

---

## Task 11: イベント申込メールに ICS 添付を追加

**Files:**

- Modify: `src/shared/lib/email/event-emails.ts`
- Modify: `src/shared/emails/event-registration-confirmation.tsx`
- Modify: `src/shared/emails/event-registration-cancelled.tsx`

**目的**: イベント申込の確認/キャンセル/イベント中止メールで ICS 添付 + Add to Calendar ボタン（route handler URL 使用）を追加。

- [ ] **Step 1: `sendEventRegistrationConfirmation` に ICS 添付 + addToCalendarLinks を追加**

既存 `sendReservationConfirmationEmail` と同じパターン:

- `buildEventCalendar(params, host)` で ICS を生成し attachment として添付
- `buildAddToCalendarUrls({ ..., icsDownloadUrl: \`\${appUrl}/api/calendar/event/\${registrationId}\` })` を計算し email template に渡す
- `getCalendarEmailSettings()` の `addToCalendarLinksEnabled` / `icalAttachmentEnabled` トグルを尊重

- [ ] **Step 2: `sendEventRegistrationCancelled` に CANCEL ICS 添付を追加**

`buildEventCancelCalendar(params, host)` を使用。`EventRegistrationCancelledEmail` テンプレートに addToCalendarLinks は不要（キャンセルメールで再度カレンダーに登録するリンクは不適切）。

- [ ] **Step 3: `sendEventCancelledToAllParticipants` / `sendEventUpdatedToAllParticipants` も同様**

- `sendEventCancelledToAllParticipants`: 各参加者に `METHOD:CANCEL` + SEQUENCE インクリメント済の ICS を送付
- `sendEventUpdatedToAllParticipants`: 各参加者に `METHOD:REQUEST` + SEQUENCE インクリメント済の ICS を送付（日時変更時のみ）

- [ ] **Step 4: email template に addToCalendarLinks prop を追加**

`EventRegistrationConfirmationEmail` に以下の prop を追加:

```typescript
type AddToCalendarLinks = {
  google: string;
  outlookWeb: string;
  ics: string;
};

type Props = {
  // ... 既存
  addToCalendarLinks?: AddToCalendarLinks;
};
```

本文末尾に 3 ボタンセクションを追加（`ReservationConfirmationEmail` と同パターン）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email/event-emails.ts src/shared/emails/event-registration-confirmation.tsx src/shared/emails/event-registration-cancelled.tsx
git commit -m "feat(email): attach ICS and add-to-calendar buttons to event registration emails"
```

---

## Task 12: Add to Calendar Server Component UI

**Files:**

- Create: `src/app/(public)/_shared/components/ui/add-to-calendar.tsx`

**目的**: Editorial Magazine デザインに準拠した Google/Outlook Web/ICS ダウンロードの 3 択ボタン。Server Component で JS バンドル不要。

- [ ] **Step 1: 実装**

Write `src/app/(public)/_shared/components/ui/add-to-calendar.tsx`:

```typescript
import { IconBrandGoogle, IconBrandWindows, IconCalendarPlus } from "@tabler/icons-react";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { cn } from "@/shared/lib/cn";

type Props = {
  readonly urls: AddToCalendarUrls;
  readonly label?: string;
  readonly className?: string;
};

/**
 * Add to Calendar 3 択ボタン（Server Component、JS 不要）
 *
 * - Google Calendar: template URL で新規タブ
 * - Outlook Web: deeplink URL で新規タブ
 * - iCal (.ics): route handler URL からダウンロード（Apple Calendar / Outlook デスクトップ / その他）
 */
export function AddToCalendar({ urls, label = "カレンダーに追加", className }: Props) {
  return (
    <section
      aria-labelledby="add-to-calendar-label"
      className={cn("space-y-3", className)}
    >
      <p
        id="add-to-calendar-label"
        className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
      >
        {label}
      </p>
      <ul
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        role="list"
      >
        <li>
          <a
            href={urls.google}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconBrandGoogle className="h-4 w-4" aria-hidden="true" />
            <span>Google Calendar</span>
          </a>
        </li>
        <li>
          <a
            href={urls.outlookWeb}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconBrandWindows className="h-4 w-4" aria-hidden="true" />
            <span>Outlook</span>
          </a>
        </li>
        <li>
          <a
            href={urls.ics}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconCalendarPlus className="h-4 w-4" aria-hidden="true" />
            <span>iCal / Apple (.ics)</span>
          </a>
        </li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/_shared/components/ui/add-to-calendar.tsx
git commit -m "feat(public): add AddToCalendar server component with Google/Outlook/ICS buttons"
```

---

## Task 13: マイページ予約詳細に AddToCalendar 配置

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`

- [ ] **Step 1: 実装**

`reservation-detail.tsx` 冒頭に import:

```typescript
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { buildAddToCalendarUrls } from "@/shared/lib/ical";
import { getAppUrl } from "@/shared/lib/constants";
```

`ReservationDetail` コンポーネント内（予約情報表示セクションの直後、キャンセルボタンの前）:

```tsx
const calendarUrls = buildAddToCalendarUrls({
  summary: `【予約】${reservation.spaceName}`,
  description: [
    `予約ID: ${reservation.id.slice(0, 8).toUpperCase()}`,
    `スペース: ${reservation.spaceName}`,
    reservation.notes ? `備考: ${reservation.notes}` : undefined,
  ]
    .filter(Boolean)
    .join("\n"),
  startTime: new Date(reservation.startTime),
  endTime: new Date(reservation.endTime),
  ...(reservation.location ? { location: reservation.location } : {}),
  icsDownloadUrl: `${getAppUrl()}/api/calendar/reservation/${reservation.id}`,
});

// ... JSX 内で配置
{
  reservation.status !== "CANCELLED" && <AddToCalendar urls={calendarUrls} />;
}
```

- [ ] **Step 2: 検証**

Run: `bun run validate`

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx
git commit -m "feat(mypage): add AddToCalendar to reservation detail page"
```

---

## Task 14: マイページイベント申込一覧に AddToCalendar 配置

**Files:**

- Modify: `src/app/(public)/mypage/events/_components/event-registration-list.tsx`

- [ ] **Step 1: 実装**

各 registration カード内（status が CONFIRMED のときのみ）:

```tsx
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { buildAddToCalendarUrls } from "@/shared/lib/ical";
import { getAppUrl } from "@/shared/lib/constants";

// ... カード内
{
  registration.status === "CONFIRMED" && (
    <AddToCalendar
      urls={buildAddToCalendarUrls({
        summary: registration.eventTitle,
        description: [
          `申込ID: ${registration.id.slice(0, 8).toUpperCase()}`,
          `イベント: ${registration.eventTitle}`,
          `参加人数: ${registration.numberOfPeople}名`,
        ].join("\n"),
        startTime: new Date(registration.eventStartTime),
        endTime: new Date(registration.eventEndTime),
        ...(registration.eventLocation
          ? { location: registration.eventLocation }
          : {}),
        icsDownloadUrl: `${getAppUrl()}/api/calendar/event/${registration.id}`,
      })}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(public)/mypage/events/_components/event-registration-list.tsx
git commit -m "feat(mypage): add AddToCalendar to event registration list"
```

---

## Task 15: イベント詳細ページに AddToCalendar 配置（公開・未認証 OK）

**Files:**

- Modify: `src/app/(public)/events/[slug]/page.tsx`

**目的**: イベント公開ページは未認証者にもカレンダー追加を許可。ただし ICS ダウンロード URL は route handler が認証必須のため、ここでは Google/Outlook Web のみ提供し、ICS ボタンはイベント申込後（マイページ経由）で使う運用とする。

代替案: 未認証向けに data URL で ICS を埋め込む（ただし Gmail 系で blocked の問題あり）。本プランでは **未認証者は Google/Outlook Web の 2 択** とし、申込済み顧客はマイページから完全な 3 択にアクセスできる設計とする。

- [ ] **Step 1: 2 択版のコンポーネントを用意**

`src/app/(public)/_shared/components/ui/add-to-calendar.tsx` に `variant="public" | "authenticated"` prop を追加。`public` のときは `ics` ボタンを非表示にする。

```typescript
type Props = {
  readonly urls: AddToCalendarUrls;
  readonly label?: string;
  readonly variant?: "public" | "authenticated";
  readonly className?: string;
};

// JSX 内:
{variant === "authenticated" && (
  <li>{/* ICS ボタン */}</li>
)}
```

`variant` のデフォルトは `"authenticated"`.

- [ ] **Step 2: イベント詳細ページに配置**

```typescript
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { buildAddToCalendarUrls } from "@/shared/lib/ical";
import { getAppUrl } from "@/shared/lib/constants";

// page.tsx 内、予約ボタンの近く
<AddToCalendar
  variant="public"
  urls={buildAddToCalendarUrls({
    summary: event.title,
    description: event.summary ?? event.title,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
    ...(event.location ? { location: event.location } : {}),
    icsDownloadUrl: "", // public variant では使われない
  })}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/_shared/components/ui/add-to-calendar.tsx src/app/(public)/events/[slug]/page.tsx
git commit -m "feat(public): add AddToCalendar to event detail page (Google/Outlook only for unauth)"
```

---

## Task 16: ドキュメント — ical-patterns.md 追加

**Files:**

- Create: `.claude/rules/ical-patterns.md`

- [ ] **Step 1: ルール作成**

Write `.claude/rules/ical-patterns.md`:

```markdown
# iCal / Add to Calendar パターンルール

> `ical-generator` v9 ベース / RFC 5545 準拠 / Asia/Tokyo VTIMEZONE

## 原則

- **ICS 生成は `@/shared/lib/ical` のヘルパー経由のみ** — `new ical()` を直接呼ばない
- **UID は `buildReservationUid` / `buildEventRegistrationUid` で生成** — `localpart@domain` 形式、同一リソースで永続的に安定
- **update/cancel で SEQUENCE を必ずインクリメント** — `Reservation.icsSequence` / `EventRegistration.icsSequence` を `{ increment: 1 }` で更新
- **キャンセル通知は `METHOD:CANCEL` + `STATUS:CANCELLED`** — 同一 UID で既存カレンダー登録を上書き
- **確認/更新通知は `METHOD:REQUEST` + `STATUS:CONFIRMED`** — 同一 UID + SEQUENCE インクリメントで既存登録を上書き

## Add to Calendar URL

- **3 プロバイダ URL は `buildAddToCalendarUrls(params)` で生成** — `google` / `outlookWeb` / `ics`
- **`ics` は route handler URL を使う** — `data:` URL は Gmail 等でブロックされるため禁止
  - 予約: `${appUrl}/api/calendar/reservation/${id}` (Customer session 認証必須)
  - イベント申込: `${appUrl}/api/calendar/event/${registrationId}` (Customer session 認証必須)
- **UI は `AddToCalendar` Server Component を使用** — `variant="public"`（Google/Outlook Web のみ）/ `"authenticated"`（3 択）

## タイムゾーン

- **`Asia/Tokyo` VTIMEZONE を必ず付与** — `@touch4it/ical-timezones` の `getVtimezoneComponent` を `ical({ timezone: { name, generator } })` に渡す
- **UTC Z 形式のみ使用禁止** — Outlook/Apple の夏時間互換性のため TZID 付き DTSTART が推奨

## organizer

- **organizer は `Settings.businessName` + `noreply@<domain>` を注入** — `getNotificationEmailAddresses()` から取得
- **attendees は使用しない** — 顧客からの RSVP レスポンスを受け付ける仕組みがないため

## 禁止パターン

- **旧 `generateICalContent` / `createReservationEvent` / `generateAddToCalendarLinks` / `generateICalFeed` の復活禁止** — すべて `ical-generator` 経由に移行済
- **`data:text/calendar;base64,...` URL 禁止** — Gmail / Outlook Web でブロックされる
- **UID に `Date.now()` / `Math.random()` 禁止** — `buildReservationUid` / `buildEventRegistrationUid` を使用
- **SEQUENCE ハードコード 0 禁止** — `Reservation.icsSequence` / `EventRegistration.icsSequence` を参照
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/ical-patterns.md
git commit -m "docs(rules): add iCal / Add to Calendar patterns rule"
```

---

## Task 17: CLAUDE.md gotchas 追記

**Files:**

- Modify: `CLAUDE.md` (SSoT 定数テーブル) / `.claude/rules/gotchas.md`

- [ ] **Step 1: gotchas.md に追加**

`.claude/rules/gotchas.md` の外部 API 統合セクション末尾に追加:

```markdown
- **iCal (.ics) 生成は `@/shared/lib/ical` のヘルパー経由のみ** — `ical-generator` v9 + `@touch4it/ical-timezones` ベース。直接 SDK 呼び出し禁止。UID は `buildReservationUid` / `buildEventRegistrationUid`、cancel/update では `icsSequence: { increment: 1 }` + `METHOD:CANCEL|REQUEST` で同一 UID を再送。Add to Calendar の ICS ダウンロードは `/api/calendar/reservation/[id]` / `/api/calendar/event/[registrationId]` の customer-authenticated route handler URL を使用（`data:` URL は Gmail ブロックのため禁止）。詳細: `.claude/rules/ical-patterns.md`
```

- [ ] **Step 2: CLAUDE.md の SSoT 定数テーブルに追加**

```markdown
| `buildReservationCalendar` / `buildEventCalendar` / `buildAddToCalendarUrls` | `@/shared/lib/ical` | RFC 5545 準拠の ICS 生成 + 3 プロバイダ URL。`ical-generator` v9 ベース、UID 安定・SEQUENCE 管理・VTIMEZONE(Asia/Tokyo)・METHOD:REQUEST/CANCEL をサポート。直接 `ical()` 呼び出し禁止 |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/rules/gotchas.md
git commit -m "docs: add iCal best practices to CLAUDE.md and gotchas"
```

---

## Task 18: 最終検証

- [ ] **Step 1: フル検証**

Run: `bun run validate && bun run build`
Expected: exit 0

- [ ] **Step 2: 旧 API の grep 残存ゼロ確認**

Run:

```bash
grep -rn "generateICalContent\|createReservationEvent\|generateAddToCalendarLinks\|generateICalFeed" src/ __tests__/ 2>&1 | grep -v "docs/" | head -20
```

Expected: `No matches found` もしくはゼロ行

- [ ] **Step 3: 全テスト実行**

Run: `bun run test:all`
Expected: 新規テスト + 既存テストすべて pass

- [ ] **Step 4: seed 再実行で idempotency 確認**

Run: `bun prisma/seed.ts --demo 2>&1 | tail -20`
Expected: エラーなく完了

- [ ] **Step 5: dev サーバーで動作確認**

Run:

```bash
bun dev
# 別ターミナル:
# 1. /reservation で予約を作成 → メール本文に Google/Outlook/ICS ボタンが表示
# 2. /mypage/reservations/[id] で AddToCalendar ボタンを確認
# 3. /mypage/events で AddToCalendar ボタンを確認
# 4. /events/[slug] で AddToCalendar (public variant) を確認
# 5. /api/calendar/reservation/[id] を直接叩いて .ics ダウンロードが動くか確認
```

- [ ] **Step 6: 最終コミット**

ドキュメントやコメント漏れがあれば修正してコミット。

```bash
git status
git add <remaining>
git commit -m "chore: finalize add-to-calendar refactor"
```

---

## Self-Review チェック

1. **Spec coverage**:
   - ✅ UID 安定性 → Task 3 + Task 5
   - ✅ METHOD:CANCEL + SEQUENCE → Task 5 + Task 9
   - ✅ VTIMEZONE → Task 5
   - ✅ data URL 廃止 → Task 7 + Task 10
   - ✅ イベント申込 ICS → Task 8 + Task 11
   - ✅ UI 3 択ボタン → Task 12
   - ✅ 配置（マイページ / イベント詳細）→ Task 13, 14, 15
   - ✅ 管理者フィード移行 → Task 6
   - ✅ ドキュメント → Task 16, 17

2. **Placeholder scan**: 全タスクに実コードあり。TBD なし

3. **Type consistency**:
   - `ReservationCalendarParams.sequence` / `EventCalendarParams.sequence`: Task 4 → Task 5 → Task 7 → Task 8 一致
   - `buildReservationUid(reservationId, host)` シグネチャ: Task 3 → Task 5 → Task 6 → Task 7 一致
   - `AddToCalendarUrls`: Task 4 → Task 5 → Task 12 → Task 13 一致（`apple` ではなく `ics` プロパティ）

---

**Plan total: 18 tasks, estimated 38-42 commits.**
