/**
 * イベント申込 .ics ダウンロード API
 *
 * Customer session 認証必須。リクエストユーザー所有の申込のみ .ics を返す。
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
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    // 1. 認証
    const session = await getCustomerSession();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. バリデーション
    const raw = await params;
    const parsed = paramSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid id", { status: 400 });
    }

    // 3. 顧客紐付け
    const customer = await getCustomerByUserId(session.user.id);
    if (!customer) {
      return new NextResponse("Customer not found", { status: 404 });
    }

    // 4. 申込取得（所有者チェック）
    const registration = await getEventRegistrationForCalendar({
      registrationId: parsed.data.registrationId,
      customerId: customer.id,
    });
    if (!registration) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 5. ICS 生成
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
