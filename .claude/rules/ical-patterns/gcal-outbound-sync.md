---
description: GCal Outbound Sync の原則 (attendees 不指定 / description マーカー / fireAndForget) + 新規 outbound sync 追加チェックリスト
paths:
  - src/shared/lib/calendar-sync/**
  - src/shared/domain/**/calendar-sync*
  - src/app/(admin)/**/_shared/actions/**
---

# GCal Outbound Sync（ICS と別系統）

> ICS 配信（顧客向け、`@/shared/lib/ical`）と GCal API outbound sync（運営向け、`@/shared/lib/calendar-sync/*-outbound.ts`）は系統が異なる。ICS は RFC 5545 ファイル配信で参加者自身のカレンダーアプリ管理、outbound は運営マスターカレンダーへの server-to-server 書き込み。両者を混在させないこと。

## 原則

- **attendees は指定しない** — サービスアカウント + DWD 必須のため技術制約（[Google 公式](https://developers.google.com/calendar/api/v3/reference/events/insert): "Service accounts need to use domain-wide delegation of authority to populate the attendee list."）+ 業界標準（Eventbrite / Peatix / connpass / Luma / Meetup 全社）+ GDPR 第三者提供回避
- **description 1 行目にループ防止マーカー** — `${OUTBOUND_RESERVATION_MARKER} <id>` / `${OUTBOUND_EVENT_MARKER} <id>`（`@/shared/lib/calendar-sync/loop-prevention`）。inbound は `isAppGeneratedCalendarEvent(description)` で outbound 由来をスキップ
- **status 不問で同期** — DRAFT / PUBLISHED / SCHEDULED 全て反映。CANCELLED / soft delete のみ GCal 側から削除（`deleteXxxCalendarSync`）
- **fireAndForget で非ブロッキング** — Server Action `afterSuccess` で `fireAndForget(syncXxxOutbound(id), { operation: "syncXxxOutbound.<action>", category: ErrorCategory.EXTERNAL_API })`。GCal 障害時もアクション本体は成功
- **冪等性** — `<Entity>.googleCalendarEventId String? @unique` に保存。update 時は既存 ID で `updateCalendarEvent`、無ければ `syncXxxToCalendar` で新規作成分岐（`syncXxxOutbound` helper 内で集約）
- **エラー記録の単一化** — `markXxxCalendarSyncError` が内部で `logError` を呼ぶラッパーの場合、**catch / 非成功パス両方で直接 `logError` と重複呼び出し禁止**。Event は DB カラム無し・`logError` のみラッパーのため重複に注意。Reservation は `calendarSyncError` / `calendarSyncedAt` カラムあり DB 書き込みも伴う（両方呼ぶのが意味がある）
- **`<Entity>.icsSequence` は GCal 未使用** — ICS 配信用（METHOD:CANCEL / REQUEST の SEQUENCE）。GCal API は etag で冪等管理するため outbound では参照しない
- **`operation` 文字列は mutation 別に一意** — Cloud Logging の可観測性のため `syncXxxOutbound.create` / `.update` / `.publish` / `.duplicate` / `deleteXxxOutbound.cancel` / `.delete` のように命名

## 新規 outbound sync 追加時のチェックリスト

1. `src/shared/lib/calendar-sync/<entity>-outbound.ts`（`import "server-only"` 必須）— `syncXxxToCalendar` / `updateXxxCalendarSync` / `deleteXxxCalendarSync`
2. `src/shared/domain/<entity>/calendar-sync.ts`（`import "server-only"` 必須）— save / clear / markError helper + `getXxxForCalendarSync`（`EventSyncContext` 相当型を返す）
3. `src/shared/lib/calendar-sync/loop-prevention.ts` にマーカー定数追加（`OUTBOUND_XXX_MARKER`）+ `isAppGeneratedCalendarEvent` を更新
4. 対応する inbound（あれば）に `isAppGeneratedCalendarEvent` でスキップ追加
5. Server Action `afterSuccess` に `fireAndForget` 配線（create / update / publish / cancel / delete / duplicate 全ケース、一意の `operation` 名）
6. `<action>.ts` は `"use server"` のため async function 以外 export 禁止。`syncXxxOutbound` / `deleteXxxOutbound` は非 export internal helper
7. soft delete 時は `execute` 内で `getEventById` 等から `googleCalendarEventId` を先取りして戻り値に含める（`afterSuccess` では DB から取得不可）
8. unit test は `event-outbound.test.ts` 構造を踏襲（`mock.module` で `@/shared/lib/google-calendar` の **全 export 網羅**）

参照実装: `src/shared/lib/calendar-sync/event-outbound.ts`（予約は `outbound.ts`、domain 層は `src/shared/domain/events/calendar-sync.ts`）
