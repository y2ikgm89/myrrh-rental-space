---
description: iCal Route Handler パターン (顧客認証付き .ics ダウンロード) + メール添付パターン (3 プロバイダリンク + ICS 添付)
paths:
  - src/app/api/calendar/**
  - src/app/api/ical/**
  - src/shared/lib/email/reservation-emails*
  - src/shared/lib/email/event-emails*
  - src/shared/lib/email/reminder-emails*
  - src/shared/emails/reservation-*
  - src/shared/emails/event-registration-*
---

# Route Handler + メール添付パターン

> 顧客認証付き .ics ダウンロード Route Handler + 予約・イベント確認メールでの ICS 添付 + 3 プロバイダ Add to Calendar URL 配線。

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
