/**
 * 予約 .ics ダウンロード API
 *
 * Customer session 認証必須。リクエストユーザー所有の予約のみ .ics を返す。
 * ステータスが CANCELLED の場合は METHOD:CANCEL、それ以外は METHOD:REQUEST。
 *
 * @module app/api/calendar/reservation/[id]
 */

import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getReservationForCalendar } from "@/shared/domain/reservations/customer-queries";
import {
  buildReservationCalendar,
  buildReservationCancelCalendar,
  type ReservationCalendarParams,
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
  id: z.uuid({ error: "Invalid reservation id" }),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
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

    // 4. 予約取得（所有者チェック）
    const reservation = await getReservationForCalendar({
      reservationId: parsed.data.id,
      customerId: customer.id,
    });
    if (!reservation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 5. ICS 生成
    const host = getAppHost();
    const organizer = await getIcalOrganizer();
    const calendarParams: ReservationCalendarParams = {
      reservationId: reservation.id,
      spaceName: reservation.spaceName,
      customerName: reservation.customerName,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      sequence: reservation.icsSequence,
      ...(reservation.location != null
        ? { location: reservation.location }
        : {}),
      ...(reservation.notes != null ? { notes: reservation.notes } : {}),
      organizerName: organizer.name,
      organizerEmail: organizer.email,
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
