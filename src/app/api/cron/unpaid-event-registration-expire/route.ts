import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { expireStaleUnpaidEventRegistrationsCommand } from "@/shared/domain/events/unpaid-expiry";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * 有料イベント申込（CONFIRMED + 未決済）の fail-safe 期限切れ cron。
 *
 * 公開申込は即 CONFIRMED + UNPAID で定員を占有するため、checkout / webhook /
 * Stripe session 期限のいずれも届かないケースで座席が永久に拘束されないよう
 * 定期的に CANCELLED 化する。判定・claim・waitlist promote は
 * `expireStaleUnpaidEventRegistrationsCommand` に集約 (server-only ドメイン層)。
 */
export async function GET(request: Request) {
  try {
    await connection();

    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "unpaidEventRegistrationExpireCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    if (!(await isFeatureEnabled("events"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const result = await expireStaleUnpaidEventRegistrationsCommand();

    if (result.total > 0) {
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.EVENTS,
        CACHE_TAGS.EVENT_WAITLIST,
      ]);
    }

    return jsonSuccess({
      expired: result.total,
      details: result.expired.map((entry) => ({
        registrationId: entry.id,
        eventId: entry.eventId,
        slotId: entry.slotId,
        ticketId: entry.ticketId,
        ageMinutes: entry.ageMinutes,
      })),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "unpaidEventRegistrationExpireCron" },
    });
    return jsonError("Internal error", 500);
  }
}
