# iCal / Add to Calendar パターンルール

> `ical-generator` v10 + `@touch4it/ical-timezones` / RFC 5545 準拠 / Asia/Tokyo VTIMEZONE

## 原則

- **ICS 生成は `@/shared/lib/ical` のヘルパー経由のみ** — `ical()` を直接呼ばない（SDK 境界は `index.ts` に閉じる）
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

| パス                                                   | 内容                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `@/shared/lib/ical/index.ts`                           | ビルダー / URL ヘルパーの SSoT                           |
| `@/shared/lib/ical/uid.ts`                             | `buildReservationUid` / `buildEventRegistrationUid`      |
| `@/shared/lib/ical/types.ts`                           | `AddToCalendarUrls` / `ReservationCalendarParams` 等の型 |
| `@/public/components/ui/add-to-calendar.tsx`           | Server Component UI                                      |
| `src/app/api/calendar/reservation/[id]/route.ts`       | 予約 ICS ダウンロード（customer 認証）                   |
| `src/app/api/calendar/event/[registrationId]/route.ts` | イベント申込 ICS ダウンロード（customer 認証）           |
| `src/app/api/ical/[token]/route.ts`                    | 管理者 iCal フィード（token 認証）                       |
| `__tests__/unit/lib/ical/`                             | unit テスト（uid / index）                               |
| `__tests__/integration/api/calendar-*.test.ts`         | route handler integration テスト                         |

## 参照

- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) — iCalendar Core Object Specification
- [ical-generator v10](https://github.com/sebbo2002/ical-generator) — builder API
- [@touch4it/ical-timezones](https://github.com/touch4it/ical-timezones) — VTIMEZONE generator
