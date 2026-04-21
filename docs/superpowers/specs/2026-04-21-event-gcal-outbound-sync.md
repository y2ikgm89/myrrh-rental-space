# Event Google Calendar Outbound Sync — Specification

**Date:** 2026-04-21
**Status:** Approved (破壊的変更 OK / 後方互換性なし / 公式ベストプラクティス準拠)

---

## Problem

管理画面で `Event`（開催イベント）を作成・更新・公開・キャンセル・削除しても、運営側の Google Calendar に反映されない。`prisma/schema.prisma` には `Event.googleCalendarEventId String? @unique` フィールドが既に定義されているが、ドメインコマンド（`createEventCommand` / `updateEventCommand` / 他）で **常に `null` にリセットされるだけ** で外部 API 呼び出しが配線されていない。

結果として、スタッフは管理画面と Google Calendar を二重管理する必要がある。予約（`Reservation`）側は既に `src/shared/lib/calendar-sync/outbound.ts` で実装済みだが、同等の動線がイベント側には存在しない。

---

## Research Summary（一次ソース検証）

### Google Calendar API 公式仕様

- **サービスアカウント + `attendees`**: Domain-Wide Delegation 必須（[公式](https://developers.google.com/calendar/api/v3/reference/events/insert)）。本プロジェクトは DWD 未設定のため attendees 指定は技術的に不可。
- **`sendUpdates: "none"`**: 旧 `sendNotifications` 仕様の注記で「完全無通知は保証されない」と明記。
- **`attendees` 200 人超**: RSVP status が伝播しない（本プロジェクト小規模では非問題）。
- **`Events.import`**: `iCalUID` 必須で private copy 追加。カレンダー移行向けで、通常の新規作成は `Events.insert` が素直。

### 業界標準（Eventbrite / Peatix / connpass / Luma / Meetup）

一次ソース WebFetch 調査の結果、**5 社すべてが参加者（attendee）を Google Calendar API の `attendees` フィールドに入れず、ICS ファイル（RFC 5545）+ Add to Calendar リンク + iCal 購読フィードで完結**している。Google 公式自身も「組織者の GCal 書き込み権限がない場合は iCalendar プロトコルを使え」と指示（[公式](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events)）。

### 本プロジェクト既存 SSoT

`.claude/rules/ical-patterns.md` は以下を既に明文化済み:

- 「attendees は使用しない — 顧客からの RSVP レスポンスを受け付ける仕組みがないため」
- 「SEQUENCE インクリメント対象外: `googleCalendarEventId / calendarSyncedAt`」
- 「UID は `localpart@domain` 形式で永続安定」

よって本実装は既存 SSoT の延長に位置付けられる（新規ポリシー導入ではない）。

---

## Decisions

### A. `attendees` を指定しない（GDPR + 技術制約 + 業界標準）

- 技術的: サービスアカウントで attendees を populate するには DWD 必須で現状構成では動作しない
- 法的: 参加者メールを Google へ第三者提供することになり個人情報保護法上のリスク
- 業界標準: Eventbrite / Luma / Peatix / connpass / Meetup すべて採用していない

### B. 予約と同じカレンダー（`Settings.googleCalendarId`）を共有

- Eventbrite / Luma と同じ「運営マスターカレンダー」方式
- 別カレンダー分離は将来 Settings に `googleEventCalendarId` を追加すれば拡張可能（スコープ外）

### C. `Events.insert` を既存の汎用ヘルパー（`createCalendarEvent` / `updateCalendarEvent` / `deleteCalendarEvent`）経由で再利用

- 既存関数は `CalendarEventParams` を受ける汎用設計で予約ロジック結合なし
- `includeAttendee: false` で呼び出すことで attendees を空にできる
- 冪等性は `Event.googleCalendarEventId` の DB 保存で確保（予約と同じ pattern）
- `Events.import` は iCalUID 必須だが、既存の予約が `Events.insert` のため API を統一した方が保守性が高い

### D. 同期対象は status に依存しない

- DRAFT / PUBLISHED / SCHEDULED / CANCELLED すべて運営視点で予定として見たい
- `CANCELLED` への遷移 → `deleteCalendarEvent` で GCal から削除（STATUS:CANCELLED 代替として削除）
- soft delete（`deletedAt` 設定）→ 同様に `deleteCalendarEvent` で削除

### E. `fireAndForget` で非同期実行（予約と同じ）

- GCal 障害でイベント作成自体が失敗しないこと
- エラー時は `logError({ category: EXTERNAL_API, severity: MEDIUM })` でログのみ

### F. SEQUENCE / ICS 整合は不要

- Google Calendar API は etag / updated タイムスタンプで更新冪等性を管理
- 参加者向け ICS（`EventRegistration.icsSequence`）とは独立
- `Event` モデルに `icsSequence` フィールドを追加しない（`ical-patterns.md` SSoT に準拠）

### G. 既存 `event-inbound.ts` との整合

- `event-inbound.ts` は Calendar → Event 取り込み（逆方向）
- 本実装 `event-outbound.ts` と対称的な命名
- `event-inbound.ts` の `upsertEventFromCalendar` は「description に `予約ID:` を含むイベントはスキップ」でループ防止済み。outbound 側は GCal 側イベントの description に予約識別子を入れないため、outbound で作ったイベントが inbound で再取り込みされないよう、outbound 側 description に `イベントID: <id>` のような識別子を入れて inbound で除外するループ防止ロジックを追加する。

---

## Architecture

```
Admin Server Action (createEvent / updateEvent / publishEvent / cancelEvent / deleteEvent)
    ↓ execute
createEventCommand / updateEventCommand / ... (domain)
    ↓ afterSuccess (fireAndForget)
syncEventToCalendar / updateEventCalendarSync / deleteEventCalendarSync (event-outbound.ts)
    ↓
createCalendarEvent / updateCalendarEvent / deleteCalendarEvent (google-calendar/events.ts)
    ↓ withGoogleApiRetry
Google Calendar API (events.insert / update / delete)
    ↓ response.data.id
saveEventGoogleCalendarEventId / clearEventGoogleCalendarEventId (domain/events/calendar-sync.ts)
    ↓
Event.googleCalendarEventId DB persist
```

ループ防止:

```
Cron event-inbound.ts → importCalendarEvents
  ↓ description パターン検査
  skip if description matches "予約ID: XXX"        (既存)
  skip if description matches "イベントID: XXX"    (本実装で追加)
```

---

## Success Criteria

1. 管理画面でイベントを作成すると、Google Calendar に同一時刻・タイトル・会場で予定が登録される（`fireAndForget` のため 200ms 以内に UI へ戻る）
2. 日時・会場・タイトル変更で GCal 側も更新される（`googleCalendarEventId` を使って `events.update`）
3. イベント CANCELLED / soft delete で GCal から予定が消える
4. GCal 側で管理者がイベントを削除 → cron `event-inbound.ts` が検知しても、`googleCalendarEventId` が DB に残っているため重複作成されない（次回 update で再作成 or 削除同期）
5. GCal サービスアカウント未設定（`isGoogleCalendarEnabled() === false`）のとき、イベント操作は通常動作し GCal 同期のみスキップ
6. `bun run validate` + `bun run build` + `bun run test:integration` 全て通過
7. `ical-patterns.md` / `server-only-patterns.md` / `external-api-retry-patterns.md` / `architecture-boundaries.test.ts` に違反しない

---

## Out of Scope

- 別カレンダー分離（`Settings.googleCalendarId` ≠ event calendar id）: 将来 Settings フィールド追加で拡張
- Google Meet 自動生成: DWD 必須 + OAuth コンテキストが別問題
- `duplicateEventCommand` の GCal 同期: `googleCalendarEventId: null` で新規扱い → 次回 update で作成されればよい（暗黙）
- `restoreEventCommand` 新設: 現状 Event に restore フローなし
- 参加者 attendees 追加: 本プロジェクト方針として採用しない
- `Event.icsSequence` フィールド追加: `ical-patterns.md` で対象外と既定

---

## References

- [Google Calendar API — Events: insert](https://developers.google.com/calendar/api/v3/reference/events/insert)
- [Google Calendar API — Inviting attendees](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events)
- [Luma — Troubleshooting Google Calendar invites](https://help.luma.com/p/helpart-hsMI4Jay4ueiYfM/troubleshooting-google-calendar-invites)
- [connpass — カレンダー連携](https://help.connpass.com/basic/setting_calendar)
- `.claude/rules/ical-patterns.md` — 本プロジェクト iCal / Add to Calendar SSoT
- `.claude/rules/external-api-retry-patterns.md` — retry / idempotency 共通契約
- `src/shared/lib/calendar-sync/outbound.ts` — 予約同期の参照実装
- `src/shared/lib/calendar-sync/event-inbound.ts` — GCal → Event 取り込みの参照実装
