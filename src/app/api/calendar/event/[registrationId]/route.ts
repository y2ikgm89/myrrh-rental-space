/**
 * イベント申込 .ics ダウンロード API
 *
 * アクセス権限の判定:
 *   1. HttpOnly cookie `calendar-event-token` がある場合: HMAC 検証成功で許可
 *      (invalid token は path validation より先に拒否)
 *      (expired / target mismatch は cookie を捨てて session + 所有権へ)
 *      (ゲスト = 確認メールの「iCal (.ics)」リンク経路)
 *      メールリンクは初回のみ `?token=` を含み、proxy が cookie へ転写して
 *      クエリを除去した URL へ redirect する（URL / アクセスログ残留を遮断）。
 *   2. cookie がない場合: customer session 必須
 *      (未認証リクエストは path validation より先に 401)
 *
 * ステータスが CANCELLED の場合は METHOD:CANCEL、それ以外は METHOD:REQUEST。
 *
 * @module app/api/calendar/event/[registrationId]
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { getEventRegistrationForCalendar } from "@/shared/domain/events/registration-queries";
import {
  buildEventCalendar,
  buildEventCancelCalendar,
  type EventCalendarParams,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import {
  CALENDAR_EVENT_TOKEN_COOKIE_NAME,
  CALENDAR_EVENT_TOKEN_COOKIE_PATH,
} from "@/shared/lib/constants/calendar-token-cookie-names";
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
import { calendarDownloadByRegistrationIdRateLimiter } from "@/shared/lib/rate-limit";

const paramSchema = z.object({
  // eslint-disable-next-line local/require-trimmed-text -- URL の path segment
  registrationId: z
    .string()
    .min(1, { error: "Invalid registration id" })
    .max(40, { error: "Invalid registration id" }),
});

async function authorizeViaCustomerSession(): Promise<
  { customerId: string } | NextResponse
> {
  const session = await getCustomerSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) {
    return new NextResponse("Customer not found", { status: 404 });
  }
  return { customerId: customer.id };
}

function isSessionDenied(
  value: { customerId: string } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    // FEAT-3PLANE-04: events feature OFF 時に 404 (公開 /events と対称)。
    // ical download は customer 通知メールから叩かれるが、feature OFF 後は module
    // 全体が公開停止扱いのため .ics も配信停止するのが可視性契約に一致。
    if (!(await isFeatureEnabled("events"))) {
      return new NextResponse(null, { status: 404 });
    }

    // 1. アクセス権判定: cookie token / session は path validation より先に fail closed。
    // クエリ `?token=` は受付しない (proxy が cookie 転写済みである前提の clean-break)。
    const cookieStore = await cookies();
    const token =
      cookieStore.get(CALENDAR_EVENT_TOKEN_COOKIE_NAME)?.value ?? null;
    let lookupCustomerId: string | undefined;
    let verifiedTokenTargetId: string | undefined;
    let verifiedTokenFingerprint: string | undefined;

    if (token === null) {
      const sessionAuth = await authorizeViaCustomerSession();
      if (isSessionDenied(sessionAuth)) {
        return sessionAuth;
      }
      lookupCustomerId = sessionAuth.customerId;
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
        if (result.reason !== "expired") {
          return new NextResponse("Invalid token", { status: 401 });
        }
        // expired cookie をロックにしない。捨てて session + 所有権へ。
        cookieStore.delete({
          name: CALENDAR_EVENT_TOKEN_COOKIE_NAME,
          path: CALENDAR_EVENT_TOKEN_COOKIE_PATH,
        });
        const sessionAuth = await authorizeViaCustomerSession();
        if (isSessionDenied(sessionAuth)) {
          return sessionAuth;
        }
        lookupCustomerId = sessionAuth.customerId;
      } else {
        verifiedTokenTargetId = result.targetId;
        verifiedTokenFingerprint = calendarTokenFingerprint(token);
        lookupCustomerId = undefined;
      }
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
        // 別申込向け cookie をロックにしない。捨てて session + 所有権へ。
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
        cookieStore.delete({
          name: CALENDAR_EVENT_TOKEN_COOKIE_NAME,
          path: CALENDAR_EVENT_TOKEN_COOKIE_PATH,
        });
        verifiedTokenTargetId = undefined;
        const sessionAuth = await authorizeViaCustomerSession();
        if (isSessionDenied(sessionAuth)) {
          return sessionAuth;
        }
        lookupCustomerId = sessionAuth.customerId;
      }
    }

    // Per-registrationId rate limit (10/hour)。session または有効 token 通過後・
    // DB fetch / ICS 生成より前。匿名スパムが shared bucket を焼き潰せないよう、
    // 認可ゲートより後に置く (receipt PDF DL の HTTP-03 と同型)。
    const rateLimit =
      await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
    if (!rateLimit.success) {
      return new NextResponse("Too many requests", { status: 429 });
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
