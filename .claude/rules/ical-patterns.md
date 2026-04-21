---
paths:
  - src/shared/lib/ical/**
  - src/shared/domain/ical/**
  - src/app/api/calendar/**
  - src/app/api/ical/**
  - src/shared/lib/email/reservation-emails*
  - src/shared/lib/email/event-emails*
  - src/shared/lib/email/reminder-emails*
  - src/shared/emails/reservation-*
  - src/shared/emails/event-registration-*
  - src/app/(public)/mypage/reservations/**
  - src/app/(public)/mypage/events/**
  - src/app/(public)/events/[slug]/**
  - src/app/(public)/_shared/components/ui/add-to-calendar*
  - __tests__/unit/lib/ical/**
  - __tests__/integration/api/calendar-*
---

# iCal / Add to Calendar パターンルール

> `ical-generator` v10 + `@touch4it/ical-timezones` / RFC 5545 準拠 / Asia/Tokyo VTIMEZONE

## 原則

- **モジュール分離（公式ベストプラクティス）**
  - `@/shared/lib/ical`（index.ts）— **server-only**（`import "server-only"`）。`ical-generator` / `@touch4it/ical-timezones` に依存する ICS ビルダー SSoT。API Route / Server Action / メール送信層から使う
  - `@/shared/lib/ical/urls` — **client-safe**（純粋関数のみ、`ical-generator` 非依存）。`buildAddToCalendarUrls` / `buildGoogleCalendarUrl` / `buildOutlookWebUrl` と関連型。Client Component はこのサブパスから import する
  - `@/shared/lib/ical/uid` — **client-safe**（純粋関数）。UID ビルダー
  - `@/shared/lib/ical/types` — **client-safe**（型のみ）
- **ICS 生成は `@/shared/lib/ical` のヘルパー経由のみ** — `ical()` を直接呼ばない（SDK 境界は `index.ts` に閉じる）
- **URL ビルダーは Client Component から `@/shared/lib/ical` 直接 import 禁止** — `server-only` ガードによりビルドエラーになる。必ず `@/shared/lib/ical/urls` サブパスを使う
- **UID は `buildReservationUid` / `buildEventRegistrationUid` で生成** — `localpart@domain` 形式、同一リソースで永続的に安定（RFC 5545 §3.8.4.7）
- **update / cancel で SEQUENCE を必ずインクリメント** — `Reservation.icsSequence` / `EventRegistration.icsSequence` を `{ increment: 1 }` で更新。更新・キャンセル両方で必要（METHOD:REQUEST / METHOD:CANCEL どちらも SEQUENCE を読む）
- **キャンセル通知は `METHOD:CANCEL` + `STATUS:CANCELLED`** — 同一 UID + インクリメント済 SEQUENCE で既存カレンダー登録を上書きキャンセル
- **確認 / 更新通知は `METHOD:REQUEST` + `STATUS:CONFIRMED`** — 同一 UID + 新 SEQUENCE で既存登録を上書き

## Add to Calendar URL

- **3 プロバイダ URL は `buildAddToCalendarUrls(params)` で生成** — `google` / `outlookWeb` / `ics`
- **`ics` は route handler URL を使う** — `data:` URL は Gmail / Outlook Web でブロックされるため禁止
  - 予約: `${getAppUrl()}/api/calendar/reservation/${reservationId}` (Customer session 認証必須)
  - イベント申込: `${getAppUrl()}/api/calendar/event/${registrationId}` (Customer session 認証必須)
- **UI は `AddToCalendar` Server Component を使用** — `@/public/components/ui/add-to-calendar`
  - `variant="authenticated"`（デフォルト）: 3 択（マイページ / メール経由）
  - `variant="public"`: Google / Outlook Web のみ（未認証向け、ICS ダウンロードは提供しない）

## タイムゾーン

- **`Asia/Tokyo` VTIMEZONE を必ず付与** — `@touch4it/ical-timezones` の `getVtimezoneComponent` を `ical({ timezone: { name, generator } })` に渡す
- **UTC Z 形式のみの DTSTART 禁止** — Outlook / Apple の夏時間互換性のため TZID 付き DTSTART が推奨（`ical-generator` が自動処理）

## Route Handler パターン

顧客認証付き `.ics` ダウンロード:

```typescript
// 処理順序: 認証 → バリデーション → 所有者チェック → ICS 生成
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCustomerSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const parsed = paramSchema.safeParse(await params);
    if (!parsed.success) return new NextResponse("Invalid id", { status: 400 });

    const customer = await getCustomerByUserId(session.user.id);
    if (!customer) return new NextResponse("Customer not found", { status: 404 });

    const reservation = await getReservationForCalendar({
      reservationId: parsed.data.id,
      customerId: customer.id,
    });
    if (!reservation) return new NextResponse("Not found", { status: 404 });

    const ics = reservation.status === "CANCELLED"
      ? buildReservationCancelCalendar(params, getAppHost())
      : buildReservationCalendar(params, getAppHost());

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="reservation-${id.slice(0, 8)}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(...);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

## メール添付パターン

予約確認メールでの ICS 添付 + 3 プロバイダリンク:

```typescript
const host = getAppHost();
const appUrl = getAppUrl();
const calendarSettings = await getCalendarEmailSettings();

const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
  ? buildAddToCalendarUrls({
      summary: `【予約】${spaceName}`,
      description: "...",
      startTime,
      endTime,
      icsDownloadUrl: `${appUrl}/api/calendar/reservation/${reservationId}`,
    })
  : undefined;

const attachments = calendarSettings.icalAttachmentEnabled
  ? [
      {
        filename: `reservation-${reservationId.slice(0, 8)}.ics`,
        content: Buffer.from(
          buildReservationCalendar({ ..., sequence: icsSequence }, host),
          "utf-8",
        ),
      },
    ]
  : undefined;
```

## SEQUENCE インクリメント対象

### ✅ 対象（user-facing state transition）

- 予約: `updateReservationCommand` / `cancelReservationCommand` / `cancelCustomerReservationCommand` / `confirmReservationCommand` / `completeReservationCommand` / `markNoShowCommand` / `deleteReservationCommand` / `restoreReservationCommand`
- イベント申込: `cancelEventRegistrationCommand` / `updateEventRegistrationCommand`

### ❌ 対象外（internal / back-office）

- `paymentStatus` / Stripe ID のみ更新 → `payment-commands.ts` / `payment-queries.ts`
- `googleCalendarEventId` / `calendarSyncedAt` 等のメタデータ → `calendar-sync.ts`
- `notes` のみ更新 → `updateReservationNotesCommand`

## organizer

- **organizer は `Settings.businessName` + `noreply@<domain>` が SSoT** — `getPublicBusinessSettings()` の `businessName` を使用
- **attendees は使用しない** — 顧客からの RSVP レスポンスを受け付ける仕組みがないため

## 禁止パターン

- **旧 `generateICalContent` / `createReservationEvent` / `generateAddToCalendarLinks` / `generateICalFeed` の復活禁止** — すべて `ical-generator` 経由に移行済み
- **`data:text/calendar;base64,...` URL 禁止** — Gmail / Outlook Web でブロックされる
- **UID に `Date.now()` / `Math.random()` 禁止** — `buildReservationUid` / `buildEventRegistrationUid` を使用
- **SEQUENCE ハードコード 0 禁止** — `Reservation.icsSequence` / `EventRegistration.icsSequence` を参照
- **`ical-generator` の直接呼び出し禁止**（`ical()` / `ICalCalendar`）— `@/shared/lib/ical` ヘルパー経由のみ

## Gotchas

- **`ical-generator` は RFC 5545 の行折り返し（75 オクテット制限、`CRLF + SPACE`）を自動適用** — テストで `toMatch` / `toContain` する際は `ics.replace(/\r\n /g, "")` で unfold してから検証
- **`getAppHost()` は `@/shared/lib/constants/urls.ts`** — `getAppUrl()` のホスト名部分を抽出（URL 解析失敗時は `"localhost"` フォールバック）
- **`Reservation.icsSequence` は Prisma select に含める必要がある** — `PAYMENT_EMAIL_SELECT` / `CUSTOMER_SELECT` 等で忘れると payload builder が `undefined` を渡し実行時エラー
- **`EventRegistration.id` は cuid (`@db.VarChar(30)`)、`Reservation.id` は uuid (`@db.Uuid`)** — route handler のパラメータバリデーションで `z.uuid()` / `z.string().min(1).max(40)` を使い分ける
- **`registration.status` / `reservation.status` の文字列比較で CANCEL 判定** — `"CANCELLED"` 文字列比較（または `ReservationStatus.CANCELLED` 等の enum）

## ファイル配置

| パス                                                   | 内容                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `@/shared/lib/ical/index.ts`                           | **server-only** — ICS ビルダー SSoT（`ical-generator` 依存）               |
| `@/shared/lib/ical/urls.ts`                            | **client-safe** — Add to Calendar URL ビルダー（純粋関数）                 |
| `@/shared/lib/ical/uid.ts`                             | **client-safe** — `buildReservationUid` / `buildEventRegistrationUid`      |
| `@/shared/lib/ical/types.ts`                           | **client-safe** — `AddToCalendarUrls` / `ReservationCalendarParams` 等の型 |
| `@/public/components/ui/add-to-calendar.tsx`           | Server Component UI                                                        |
| `src/app/api/calendar/reservation/[id]/route.ts`       | 予約 ICS ダウンロード（customer 認証）                                     |
| `src/app/api/calendar/event/[registrationId]/route.ts` | イベント申込 ICS ダウンロード（customer 認証）                             |
| `src/app/api/ical/[token]/route.ts`                    | 管理者 iCal フィード（token 認証）                                         |
| `__tests__/unit/lib/ical/`                             | unit テスト（uid / index）                                                 |
| `__tests__/integration/api/calendar-*.test.ts`         | route handler integration テスト                                           |

---

## GCal Outbound Sync（ICS と別系統）

ICS 配信（顧客向け、`@/shared/lib/ical`）と GCal API outbound sync（運営向け、
`@/shared/lib/calendar-sync/*-outbound.ts`）は系統が異なる。ICS は RFC 5545
ファイル配信で参加者自身のカレンダーアプリ管理、outbound は運営マスターカレンダー
への server-to-server 書き込み。両者を混在させないこと。

### 原則

- **attendees は指定しない** — サービスアカウント + DWD 必須のため技術制約（[Google 公式](https://developers.google.com/calendar/api/v3/reference/events/insert): "Service accounts need to use domain-wide delegation of authority to populate the attendee list."）+ 業界標準（Eventbrite / Peatix / connpass / Luma / Meetup 全社）+ GDPR 第三者提供回避
- **description 1 行目にループ防止マーカー** — `${OUTBOUND_RESERVATION_MARKER} <id>` / `${OUTBOUND_EVENT_MARKER} <id>`（`@/shared/lib/calendar-sync/loop-prevention`）。inbound は `isAppGeneratedCalendarEvent(description)` で outbound 由来をスキップ
- **status 不問で同期** — DRAFT / PUBLISHED / SCHEDULED 全て反映。CANCELLED / soft delete のみ GCal 側から削除（`deleteXxxCalendarSync`）
- **fireAndForget で非ブロッキング** — Server Action `afterSuccess` で `fireAndForget(syncXxxOutbound(id), { operation: "syncXxxOutbound.<action>", category: ErrorCategory.EXTERNAL_API })`。GCal 障害時もアクション本体は成功
- **冪等性** — `<Entity>.googleCalendarEventId String? @unique` に保存。update 時は既存 ID で `updateCalendarEvent`、無ければ `syncXxxToCalendar` で新規作成分岐（`syncXxxOutbound` helper 内で集約）
- **エラー記録の単一化** — `markXxxCalendarSyncError` が内部で `logError` を呼ぶラッパーの場合、**catch / 非成功パス両方で直接 `logError` と重複呼び出し禁止**。Event は DB カラム無し・`logError` のみラッパーのため重複に注意。Reservation は `calendarSyncError` / `calendarSyncedAt` カラムあり DB 書き込みも伴う（両方呼ぶのが意味がある）
- **`<Entity>.icsSequence` は GCal 未使用** — ICS 配信用（METHOD:CANCEL / REQUEST の SEQUENCE）。GCal API は etag で冪等管理するため outbound では参照しない（`SEQUENCE インクリメント対象外` リストに `googleCalendarEventId` / `calendarSyncedAt` を既出）
- **`operation` 文字列は mutation 別に一意** — Cloud Logging の可観測性のため `syncXxxOutbound.create` / `.update` / `.publish` / `.duplicate` / `deleteXxxOutbound.cancel` / `.delete` のように命名

### 新規 outbound sync 追加時のチェックリスト

1. `src/shared/lib/calendar-sync/<entity>-outbound.ts`（`import "server-only"` 必須）— `syncXxxToCalendar` / `updateXxxCalendarSync` / `deleteXxxCalendarSync`
2. `src/shared/domain/<entity>/calendar-sync.ts`（`import "server-only"` 必須）— save / clear / markError helper + `getXxxForCalendarSync`（`EventSyncContext` 相当型を返す）
3. `src/shared/lib/calendar-sync/loop-prevention.ts` にマーカー定数追加（`OUTBOUND_XXX_MARKER`）+ `isAppGeneratedCalendarEvent` を更新
4. 対応する inbound（あれば）に `isAppGeneratedCalendarEvent` でスキップ追加
5. Server Action `afterSuccess` に `fireAndForget` 配線（create / update / publish / cancel / delete / duplicate 全ケース、一意の `operation` 名）
6. `<action>.ts` は `"use server"` のため async function 以外 export 禁止。`syncXxxOutbound` / `deleteXxxOutbound` は非 export internal helper
7. soft delete 時は `execute` 内で `getEventById` 等から `googleCalendarEventId` を先取りして戻り値に含める（`afterSuccess` では DB から取得不可）
8. unit test は `event-outbound.test.ts` 構造を踏襲（`mock.module` で `@/shared/lib/google-calendar` の **全 export 網羅**）

参照実装: `src/shared/lib/calendar-sync/event-outbound.ts`（予約は `outbound.ts`、domain 層は `src/shared/domain/events/calendar-sync.ts`）

---

## 参照

- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) — iCalendar Core Object Specification
- [ical-generator v10](https://github.com/sebbo2002/ical-generator) — builder API
- [@touch4it/ical-timezones](https://github.com/touch4it/ical-timezones) — VTIMEZONE generator
