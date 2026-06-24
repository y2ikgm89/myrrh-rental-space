/**
 * 予約 .ics ダウンロード API
 *
 * アクセス権限の判定:
 *   1. クエリ `?token=<署名付きトークン>` がある場合: HMAC 検証成功で許可
 *      (ゲスト = 確認メール / リマインダの「iCal (.ics)」リンク経路)
 *   2. それ以外: customer session 必須 + 所有者一致
 *
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
  id: z.uuid({ error: "Invalid reservation id" }),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. パスパラメータ検証
    const raw = await params;
    const parsed = paramSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid id", { status: 400 });
    }
    const reservationId = parsed.data.id;

    // 2. アクセス権判定: token 経路 → session 経路の順で解決
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    let lookupCustomerId: string | undefined;

    if (token !== null) {
      const result = verifyCalendarToken(token, "reservation");
      if (!result.valid) {
        logError(
          normalizeError(
            new Error(`Calendar token ${result.reason}: reservation`),
          ),
          {
            category: ErrorCategory.AUTHORIZATION,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "calendarReservationDownload",
              reason: result.reason,
              tokenFingerprint: calendarTokenFingerprint(token),
              reservationId,
            },
          },
        );
        return new NextResponse(
          result.reason === "expired" ? "Token expired" : "Invalid token",
          { status: result.reason === "expired" ? 410 : 401 },
        );
      }
      if (result.targetId !== reservationId) {
        // payload と URL の reservationId 不一致 = 改ざんまたは流用
        logError(normalizeError(new Error("Calendar token target mismatch")), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "calendarReservationDownload",
            tokenFingerprint: calendarTokenFingerprint(token),
            urlReservationId: reservationId,
            payloadReservationId: result.targetId,
          },
        });
        return new NextResponse("Invalid token", { status: 401 });
      }
      // token 検証成功 → customer ownership 強制をスキップ
      lookupCustomerId = undefined;
    } else {
      const session = await getCustomerSession();
      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) {
        return new NextResponse("Customer not found", { status: 404 });
      }
      lookupCustomerId = customer.id;
    }

    // 3. 予約取得
    const reservation = await getReservationForCalendar({
      reservationId,
      ...(lookupCustomerId !== undefined
        ? { customerId: lookupCustomerId }
        : {}),
    });
    if (!reservation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 4. ICS 生成
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
