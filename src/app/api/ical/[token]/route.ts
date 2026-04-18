/**
 * iCalフィード配信API
 *
 * 外部カレンダーアプリ（TimeTree, Google Calendar等）から購読可能な
 * iCalフィード（.ics）を配信します。`ical-generator` v10 + RFC 5545 準拠。
 *
 * ## 機能
 * - トークンベースの認証
 * - 予約データの iCal 形式変換（VTIMEZONE Asia/Tokyo + 安定 UID + SEQUENCE）
 * - スペース別フィルタリング
 *
 * @module api/ical/[token]
 */

import { NextResponse } from "next/server";
import { format } from "date-fns";
import { unstable_rethrow } from "next/navigation";
import {
  getICalFeedRuntimeSettings,
  getICalReservations,
  getICalTokenByValue,
} from "@/shared/domain/ical/queries";
import { markICalTokenUsed } from "@/shared/domain/ical/commands";
import {
  buildICalFeed,
  buildReservationUid,
  type ICalFeedEntry,
} from "@/shared/lib/ical";
import { getAppHost } from "@/shared/lib/constants";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * iCalフィード配信エンドポイント
 * GET /api/ical/{token}
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const settings = await getICalFeedRuntimeSettings();
    if (!settings.enabled) {
      return new NextResponse("iCal feed is disabled", { status: 403 });
    }

    const icalToken = await getICalTokenByValue(token);
    if (!icalToken) {
      return new NextResponse("Invalid token", { status: 404 });
    }
    if (icalToken.expiresAt && icalToken.expiresAt < new Date()) {
      return new NextResponse("Token expired", { status: 410 });
    }

    fireAndForget(markICalTokenUsed(icalToken.id), {
      operation: "updateICalTokenLastUsed",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
    });

    // 直近3ヶ月 + 過去1ヶ月の予約を取得
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setMonth(rangeStart.getMonth() - 1);
    const rangeEnd = new Date(now);
    rangeEnd.setMonth(rangeEnd.getMonth() + 3);

    const reservations = await getICalReservations({
      rangeStart,
      rangeEnd,
      spaceId: icalToken.spaceId,
    });

    const host = getAppHost();

    const entries: ICalFeedEntry[] = reservations.map((r) => {
      const formattedDate = format(r.startTime, "yyyy/MM/dd");
      const formattedStart = format(r.startTime, "HH:mm");
      const formattedEnd = format(r.endTime, "HH:mm");

      const customerInfo = settings.includeCustomerInfo
        ? `${r.customerLastName} ${r.customerFirstName}様`
        : "予約済み";

      const descriptionLines = [
        `予約ID: ${r.id.slice(0, 8).toUpperCase()}`,
        `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
      ];
      if (settings.includeCustomerInfo) {
        descriptionLines.push(`お客様: ${customerInfo}`);
      }

      return {
        uid: buildReservationUid(r.id, host),
        summary: `【予約】${r.spaceName}${settings.includeCustomerInfo ? ` - ${customerInfo}` : ""}`,
        description: descriptionLines.join("\n"),
        startTime: r.startTime,
        endTime: r.endTime,
        ...(r.spaceAddress != null ? { location: r.spaceAddress } : {}),
        sequence: r.icsSequence,
      };
    });

    const calendarName = icalToken.spaceName
      ? `${icalToken.spaceName} - 予約カレンダー`
      : "予約カレンダー";

    const icalContent = buildICalFeed({ calendarName, entries }, host);

    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${icalToken.name || "calendar"}.ics"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "iCalFeed" },
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
