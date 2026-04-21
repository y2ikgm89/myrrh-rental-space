# Event Google Calendar Outbound Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-21-event-gcal-outbound-sync.md`

**Goal:** Event CRUD（create / update / publish / cancel / delete）から Google Calendar マスターカレンダーへ非ブロッキング同期を配線する。attendees 無し・`Events.insert` 再利用・`fireAndForget` 方式で業界標準（Eventbrite / Luma / Peatix）と公式ベストプラクティスに準拠。

**Architecture:** `src/shared/lib/calendar-sync/event-outbound.ts` を新設し、既存の汎用 `createCalendarEvent` / `updateCalendarEvent` / `deleteCalendarEvent` を再利用。ドメイン側 `src/shared/domain/events/calendar-sync.ts` を新設して `Event.googleCalendarEventId` の save / clear / mark error を担う。Server Actions の `afterSuccess` で `fireAndForget` 呼び出し。既存 `event-inbound.ts` のループ防止パターンを拡張して outbound 由来イベントの再取り込みを防ぐ。

**Tech Stack:** Next.js 16 Server Actions / Prisma 7 / googleapis (calendar_v3) / `withGoogleApiRetry` / `fireAndForget` / `logError` / `server-only`

**Key Constraints (from .claude/rules/):**

- `ical-patterns.md`: attendees 非使用、`Event.icsSequence` 追加禁止、`localpart@domain` UID 形式
- `server-only-patterns.md`: `googleapis` 統合は `import "server-only"` 必須
- `external-api-retry-patterns.md`: `withGoogleApiRetry` 経由、直接 SDK 呼び出し禁止
- `gotchas.md`: `exactOptionalPropertyTypes` 下の optional フィールドは条件スプレッド必須
- `architecture-boundaries.test.ts`: Prisma 名前空間 gateway 経由

---

## File Structure

### 新規作成

```
src/shared/lib/ical/uid.ts
  ← 既存ファイルに buildEventUid 追加

src/shared/lib/calendar-sync/
  types.ts                         — EventSyncData 型追加（既存ファイルに追加）
  event-outbound.ts                — NEW: Event → GCal sync ファサード

src/shared/domain/events/
  calendar-sync.ts                 — NEW: saveEventGoogleCalendarEventId / clearEventGoogleCalendarEventId / markEventCalendarSyncError / markEventCalendarSyncSuccess

__tests__/unit/lib/ical/
  uid.test.ts                      — buildEventUid テスト追加（既存ファイルに追加）

__tests__/unit/lib/calendar-sync/
  event-outbound.test.ts           — NEW: event-outbound ユニットテスト
```

### 変更

```
src/shared/lib/calendar-sync/event-inbound.ts
  ← description パターンに "イベントID:" ループ防止フィルタ追加

src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts
  ← createEvent / updateEvent / deleteEvent / publishEvent / cancelEvent / duplicateEvent の afterSuccess に fireAndForget 追加

src/shared/domain/events/commands.ts
  ← createEventCommand / updateEventCommand の戻り値に slug 以外に venue 情報（GCal format 用）を追加する必要があれば
  ← cancelEventCommand / deleteEventCommand の戻り値に googleCalendarEventId 返却

__tests__/integration/actions/admin/event.test.ts
  ← GCal sync mock 追加
```

---

## Task Dependencies

```
Task 1 (UID + types)
  │
  ├─→ Task 2 (event-outbound.ts)
  │       │
  │       ├─→ Task 3 (domain calendar-sync.ts)
  │       │       │
  │       │       └─→ Task 4 (Server Actions 配線)
  │       │                │
  │       │                └─→ Task 6 (integration test)
  │       │
  │       └─→ Task 5 (event-inbound ループ防止)
  │
  └─→ Task 1b (uid.test.ts)
```

Task 1 + Task 1b は 1 implementer にバンドル可能。
Task 2 + Task 3 は密結合のため 1 implementer にバンドル。
Task 4 + Task 5 は独立（並列可能）。
Task 6 は Task 4 に依存。

---

## Task 1: `buildEventUid` 追加 + types 追加

### Subtasks

- [ ] `src/shared/lib/ical/uid.ts` に `buildEventUid(eventId: string, host: string): string` を追加。戻り値形式 `event-${eventId}@${normalizeHost(host)}`。Event id は cuid VARCHAR(30) なのでそのまま挿入可能
- [ ] `src/shared/lib/ical/index.ts` の末尾 `export { buildEventRegistrationUid, buildReservationUid } from "./uid";` に `buildEventUid` を追加
- [ ] `src/shared/lib/calendar-sync/types.ts` に `EventSyncData` interface を追加:

```typescript
export interface EventSyncData {
  eventId: string;
  title: string;
  descriptionPlainText: string; // Lexical plainText 派生
  startTime: Date;
  endTime: Date;
  /** 合成済み会場文字列（formatEventVenue の結果）*/
  location: string | null;
  /** 公開ページ URL（管理者が GCal から公開ページに飛べるようにする） */
  publicUrl: string;
}
```

- [ ] `__tests__/unit/lib/ical/uid.test.ts` に `buildEventUid` テスト追加:
  - host あり → `event-<id>@example.com`
  - host 空文字 → `event-<id>@localhost`
  - host 前後 trim 確認
  - 既存 `buildReservationUid` / `buildEventRegistrationUid` と異なる prefix であること（衝突回避）

### 検証

- [ ] `bun run type-check`
- [ ] `bun test __tests__/unit/lib/ical/uid.test.ts`

---

## Task 2 + 3: `event-outbound.ts` + domain `calendar-sync.ts`

密結合のため 1 implementer にバンドル。

### Subtasks (Task 2: event-outbound.ts)

- [ ] `src/shared/lib/calendar-sync/event-outbound.ts` を新設。冒頭 `import "server-only"` 必須。`outbound.ts` を参照実装として `ReservationSyncData` → `EventSyncData` に置換した構造にする
- [ ] 以下の公開関数を export:
  - `syncEventToCalendar(data: EventSyncData): Promise<SyncResult>` — 新規作成
  - `updateEventCalendarSync(data: EventSyncData, existingEventId: string): Promise<SyncResult>` — 既存 GCal イベント ID で更新
  - `deleteEventCalendarSync(eventId: string, gcalEventId: string): Promise<{ success: boolean; error?: string }>` — 削除
- [ ] `formatEventCalendarEvent(data: EventSyncData): CalendarEventParams` を private 関数として定義:
  - `summary`: `data.title`（status が CANCELLED のときの prefix 付加は **行わない**。CANCELLED 時は `deleteEventCalendarSync` が呼ばれる）
  - `description`: 以下の順で `\n` 結合:
    - `イベントID: ${data.eventId}` ← **inbound ループ防止のため必須第1行**
    - `公開ページ: ${data.publicUrl}`
    - 空行
    - `data.descriptionPlainText`（200文字以内、既に domain command で生成済み）
  - `location`: `data.location ?? undefined`
  - `startTime` / `endTime`: `data.startTime` / `data.endTime`
  - `attendeeEmail`: **`undefined`**（attendees 未使用）
- [ ] `createCalendarEvent(eventParams)` を呼ぶ際は **`includeAttendee: false`** がデフォルトなのでそのまま呼ぶ
- [ ] エラーハンドリングは `outbound.ts` と同型:
  - `try/catch` 内で `isGoogleCalendarEnabled()` チェック → false なら `{ success: true }` no-op
  - `createCalendarEvent` 成功 → `saveEventGoogleCalendarEventId` で DB 保存
  - 失敗 → `markEventCalendarSyncError` で DB 記録 + `logError({ category: EXTERNAL_API, severity: MEDIUM })`
  - 戻り値は `omitUndefined({ success: false, error })` で `exactOptionalPropertyTypes` 対応

### Subtasks (Task 3: domain/events/calendar-sync.ts)

- [ ] `src/shared/domain/events/calendar-sync.ts` を新設。冒頭 `import "server-only"` 必須
- [ ] 以下の公開関数を export:

```typescript
export async function saveEventGoogleCalendarEventId(params: {
  eventId: string;
  googleCalendarEventId: string;
}): Promise<void>;

export async function clearEventGoogleCalendarEventId(
  eventId: string,
): Promise<void>;

export async function markEventCalendarSyncError(params: {
  eventId: string;
  error: string;
}): Promise<void>;

export async function getEventForCalendarSync(
  eventId: string,
): Promise<EventSyncData | null>;
```

- [ ] `getEventForCalendarSync` は `prisma.event.findUnique` で必要フィールドを select + `formatEventVenue` で location 合成 + `getAppUrl()` / publicUrl 生成して `EventSyncData` を組み立てる（actions 層でのデータ組み立て重複を避ける）
- [ ] `Event` モデルには `calendarSyncedAt` / `calendarSyncError` などのフィールドは**現状存在しない**ため、エラー記録用のフィールドを追加するか、logError のみで済ませるか選択:
  - **選択**: logError のみで済ませる（Prisma schema 変更を避ける）。`markEventCalendarSyncError` は logError ラッパーとして実装し、`googleCalendarEventId` は変更しない
- [ ] `clearEventGoogleCalendarEventId` は `prisma.event.update({ where: { id }, data: { googleCalendarEventId: null } })`

### 検証

- [ ] `bun run type-check`
- [ ] `bun test __tests__/unit/lib/calendar-sync/event-outbound.test.ts`（次 subtask で作成）
- [ ] **`grep -rnE "(calendar|client)\.(events|calendars|channels)\.[a-zA-Z]+\s*\(" src/` で `event-outbound.ts` が直接 SDK 呼び出しをしていないことを確認**（`withGoogleApiRetry` 経由のみ許容）

### Subtasks (event-outbound.test.ts)

- [ ] `__tests__/unit/lib/calendar-sync/event-outbound.test.ts` を新設
- [ ] `mock.module("@/shared/lib/google-calendar", ...)` で `isGoogleCalendarEnabled` / `createCalendarEvent` / `updateCalendarEvent` / `deleteCalendarEvent` を mock
- [ ] `mock.module("@/shared/domain/events/calendar-sync", ...)` で DB helper を mock
- [ ] テストケース:
  - `syncEventToCalendar`: GCal disabled → no-op `{ success: true }`
  - `syncEventToCalendar`: GCal enabled → `createCalendarEvent` 呼び出し + `saveEventGoogleCalendarEventId` 呼び出し
  - `syncEventToCalendar`: `createCalendarEvent` 失敗 → `markEventCalendarSyncError` 呼び出し + `{ success: false, error }`
  - `syncEventToCalendar`: formatCalendarEvent が `description` 1 行目に `イベントID: ${id}` を含む
  - `syncEventToCalendar`: formatCalendarEvent が `attendeeEmail: undefined` を渡す
  - `updateEventCalendarSync`: `updateCalendarEvent(existingEventId, ...)` 呼び出し
  - `deleteEventCalendarSync`: `deleteCalendarEvent(gcalEventId)` 呼び出し + `clearEventGoogleCalendarEventId` 呼び出し

---

## Task 4: Server Actions 配線

### Subtasks

- [ ] `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts` 全 mutation action の `afterSuccess` に `fireAndForget` で outbound sync を配線
- [ ] `createEvent`:

```typescript
afterSuccess: (data) => {
  invalidateEventCaches(data.id, data.slug);
  fireAndForget(
    (async () => {
      const syncData = await getEventForCalendarSync(data.id);
      if (syncData) await syncEventToCalendar(syncData);
    })(),
    { operation: "syncEventToCalendar", category: ErrorCategory.EXTERNAL_API },
  );
};
```

- [ ] `updateEvent`:
  - 既存 GCal event ID を取得（`getEventForCalendarSync` の戻り値に含める、または別途 `prisma.event.findUnique({ select: { googleCalendarEventId: true } })`）
  - `googleCalendarEventId` が既にある → `updateEventCalendarSync(syncData, existingId)`
  - ない → `syncEventToCalendar(syncData)`（初回同期）
- [ ] `publishEvent`: `updateEvent` と同じロジック（publish は状態遷移のみだが GCal summary 等が変わる可能性は低い。実用上は更新 upsert で問題なし）
- [ ] `cancelEvent`: GCal から削除:

```typescript
afterSuccess: () => {
  invalidateEventCaches(idParsed.data, event.slug, { registrations: true });
  fireAndForget(
    (async () => {
      const existing = await prisma.event.findUnique({
        where: { id: idParsed.data },
        select: { googleCalendarEventId: true },
      });
      if (existing?.googleCalendarEventId) {
        await deleteEventCalendarSync(
          idParsed.data,
          existing.googleCalendarEventId,
        );
      }
    })(),
    {
      operation: "deleteEventCalendarSync",
      category: ErrorCategory.EXTERNAL_API,
    },
  );
};
```

- [ ] `deleteEvent`（soft delete）: `cancelEvent` と同じ削除ロジック
- [ ] `duplicateEvent`: `googleCalendarEventId` は既に `commands.ts` で `null` クリアされているため、新規イベント扱いで `syncEventToCalendar` が呼ばれる。`afterSuccess` に `createEvent` と同じ配線を追加
- [ ] import:

```typescript
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
} from "@/shared/lib/calendar-sync/event-outbound";
import { getEventForCalendarSync } from "@/shared/domain/events/calendar-sync";
```

### 検証

- [ ] `bun run type-check`
- [ ] `bun run lint`
- [ ] `grep -n "fireAndForget" src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/event.ts` で全 mutation action に配線済み確認

---

## Task 5: `event-inbound.ts` ループ防止フィルタ

### Subtasks

- [ ] `src/shared/lib/calendar-sync/event-inbound.ts` の既存「`予約ID:` を含むイベントはスキップ」ロジックに併記する形で「`イベントID:` を含むイベントはスキップ」を追加
- [ ] 対象箇所: `importCalendarEvents` 内の description 判定条件
- [ ] 実装例:

```typescript
const description = gcalEvent.description ?? "";
// 予約（outbound.ts が作成した GCal イベント）をスキップ
if (description.includes("予約ID:")) continue;
// イベント（event-outbound.ts が作成した GCal イベント）をスキップ
if (description.includes("イベントID:")) continue;
```

- [ ] 既存の `upsertEventFromCalendar` への引数が変わらないこと確認（description 判定は `importCalendarEvents` 内で完結）
- [ ] **integration test がある場合**（`__tests__/integration/api/cron-calendar-sync.test.ts` 等）、`description: "イベントID: xxx\n..."` の GCal event を mock で流し込み、skip されることを検証するケースを追加

### 検証

- [ ] `bun run type-check`
- [ ] `grep -rn "予約ID:" src/shared/lib/calendar-sync/` で既存ロジックが壊れていないことと新規ロジックの対称性を確認

---

## Task 6: Integration test 更新

### Subtasks

- [ ] `__tests__/integration/actions/admin/event.test.ts` の `createEvent` / `updateEvent` / `cancelEvent` / `deleteEvent` / `duplicateEvent` テストで以下を追加:
  - `mock.module("@/shared/lib/calendar-sync/event-outbound", ...)` で `syncEventToCalendar` / `updateEventCalendarSync` / `deleteEventCalendarSync` を mock
  - `mock.module("@/shared/domain/events/calendar-sync", ...)` で `getEventForCalendarSync` を mock
  - 各アクション成功時に対応する outbound 関数が呼ばれること（`toHaveBeenCalledWith` で引数も検証）
  - GCal 同期失敗でもアクション自体は成功すること（`fireAndForget` の契約）
- [ ] `cancelEvent` / `deleteEvent` で `googleCalendarEventId` が `null` の Event → `deleteEventCalendarSync` は呼ばれない（ガード確認）

### 検証

- [ ] `bun test __tests__/integration/actions/admin/event.test.ts`
- [ ] `bun run test:integration`（該当バッチ）

---

## Verification (All Tasks Complete)

- [ ] `bun run validate`（type-check + lint）
- [ ] `bun run test:unit`
- [ ] `bun run test:integration`
- [ ] `bun run build`
- [ ] `bun run build:skip-env` でも成功すること（env 未設定時）
- [ ] 手動検証（dev server）:
  1. `/admin/settings` で Google Calendar 設定が有効な状態
  2. `/admin/events/new` でイベント作成
  3. Google Calendar 管理画面でイベントが登録されていること（Title / 日時 / 会場一致）
  4. description 1 行目に `イベントID: <id>` が入っていること
  5. イベント編集で日時変更 → GCal 側も更新されること
  6. イベントキャンセル → GCal 側から削除されること
  7. GCal 同期が無効な設定でイベント作成 → エラーなく作成されること
- [ ] grep による違反検出ゼロ確認:

```bash
# 直接 SDK 呼び出し禁止（withGoogleApiRetry 経由のみ）
grep -rnE "(calendar|client)\.(events|calendars|channels)\.[a-zA-Z]+\s*\(" src/ | grep -v "retry\|withGoogleApiRetry"
# server-only マーカー欠落検出
grep -rlE '^import .+ from "(ical-generator|googleapis|resend|@touch4it|nodemailer|stripe|google-auth-library|node:)' src/ | while read f; do
  head -30 "$f" | grep -q '^import "server-only"' || echo "MISSING: $f"
done
# イベント用 description 識別子が event-inbound.ts で考慮されていること
grep -n "イベントID:" src/shared/lib/calendar-sync/event-inbound.ts
```

---

## Dispatch Strategy (subagent-driven-development)

| バンドル | タスク   | implementer モデル | 理由                                              |
| -------- | -------- | ------------------ | ------------------------------------------------- |
| Bundle 1 | Task 1   | sonnet             | 単純な helper 追加 + test                         |
| Bundle 2 | Task 2+3 | sonnet             | 密結合（event-outbound が calendar-sync を呼ぶ）  |
| Bundle 3 | Task 4   | sonnet             | Bundle 2 の公開 API を消費                        |
| Bundle 4 | Task 5   | sonnet             | 独立（inbound フィルタ追加）、Bundle 3 と並列可能 |
| Bundle 5 | Task 6   | sonnet             | Bundle 3 の配線内容を mock で検証                 |

各 Bundle 完了後に main で `git log --oneline -N` + `git show --stat HEAD` で独立検証。
haiku は使用しない（CLAUDE.md 規律）。

---

## Risk Mitigation

- **GCal API 障害でイベント作成ブロック** → `fireAndForget` で非ブロッキング化（予約と同パターン）
- **GCal カレンダー ID 未設定で silent fail** → `isGoogleCalendarEnabled()` チェックで no-op、`logError` なし（意図的な disabled 状態）
- **GCal 側でイベントが手動削除されたあとアプリ側で update** → `updateCalendarEvent` が 404/410 を返す → `withGoogleApiRetry` が即時失敗扱い → `logError` で記録。次回 update で新規 insert しないため「GCal から消えたまま」になるが、これは運用者の明示的削除として尊重する（自動再作成しない）
- **inbound ループ** → description 1 行目 `イベントID:` フィルタで防止。万一 description を管理者が GCal 上で書き換えた場合はループの可能性があるが、`googleCalendarEventId` unique 制約で `upsertEventFromCalendar` 側が別 event として扱い重複作成を防ぐ
- **既存イベントの移行** → `googleCalendarEventId` が `null` の既存イベントを次回 update した際に新規 insert される。初回 update 時に GCal 側にも登録される自然な移行となる。バックフィル cron は不要
