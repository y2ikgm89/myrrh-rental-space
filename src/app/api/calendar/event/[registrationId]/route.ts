/**
 * イベント申込 .ics ダウンロード API
 *
 * アクセス権限の判定:
 *   1. クエリ `?token=<署名付きトークン>` がない場合: customer session 必須
 *      (未認証リクエストは path validation より先に 401)
 *   2. token がある場合: HMAC 検証成功で許可
 *      (invalid / expired token は path validation より先に拒否)
 *      (ゲスト = 確認メールの「iCal (.ics)」リンク経路)
 *
 * ステータスが CANCELLED の場合は METHOD:CANCEL、それ以外は METHOD:REQUEST。
 *
 * @module app/api/calendar/event/[registrationId]
 */

import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getEventRegistrationForCalendar } from "@/shared/domain/events/registration-queries";
import {
  buildEventCalendar,
  buildEventCancelCalendar,
  type EventCalendarParams,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import {
  calendarTokenFingerprint,
  verifyCalendarToken,
} from "@/shared/lib/calendar/calendar-token";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
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
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    // 1. アクセス権判定: session 経路は path validation より先に fail closed
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    let lookupCustomerId: string | undefined;
    let verifiedTokenTargetId: string | undefined;
    let verifiedTokenFingerprint: string | undefined;

    if (token === null) {
      const session = await getCustomerSession();
      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) {
        return new NextResponse("Customer not found", { status: 404 });
      }
      lookupCustomerId = customer.id;
    } else {
      const result = verifyCalendarToken(token, "event");
      if (!result.valid) {
        logError(
          normalizeError(new Error(`Calendar token ${result.reason}: event`)),
          {
            category: ErrorCategory.AUTHORIZATION,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "calendarEventDownload",
              reason: result.reason,
              tokenFingerprint: calendarTokenFingerprint(token),
            },
          },
        );
        return new NextResponse(
          result.reason === "expired" ? "Token expired" : "Invalid token",
          { status: result.reason === "expired" ? 410 : 401 },
        );
      }
      verifiedTokenTargetId = result.targetId;
      verifiedTokenFingerprint = calendarTokenFingerprint(token);
      lookupCustomerId = undefined;
    }

    // 2. パスパラメータ検証
    const raw = await params;
    const parsed = paramSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid id", { status: 400 });
    }
    const registrationId = parsed.data.registrationId;

    if (verifiedTokenTargetId !== undefined) {
      if (verifiedTokenTargetId !== registrationId) {
        logError(normalizeError(new Error("Calendar token target mismatch")), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "calendarEventDownload",
            tokenFingerprint: verifiedTokenFingerprint,
            urlRegistrationId: registrationId,
            payloadRegistrationId: verifiedTokenTargetId,
          },
        });
        return new NextResponse("Invalid token", { status: 401 });
      }
    }

    // 3. 申込取得
    const registration = await getEventRegistrationForCalendar({
      registrationId,
      ...(lookupCustomerId !== undefined
        ? { customerId: lookupCustomerId }
        : {}),
    });
    if (!registration) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 4. ICS 生成
    const host = getAppHost();
    const organizer = await getIcalOrganizer();
    const calendarParams: EventCalendarParams = {
      registrationId: registration.id,
      eventTitle: registration.eventTitle,
      customerName: registration.customerName,
      startTime: registration.startTime,
      endTime: registration.endTime,
      quantity: registration.quantity,
      sequence: registration.icsSequence,
      ...(registration.location != null
        ? { location: registration.location }
        : {}),
      organizerName: organizer.name,
      organizerEmail: organizer.email,
      format: registration.format,
      meetingUrl: registration.meetingUrl,
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
