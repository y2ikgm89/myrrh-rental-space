import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { expireStalePendingReservationsCommand } from "@/shared/domain/reservations/pending-expiry";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * `PENDING` 予約 fail-safe 期限切れ cron。
 *
 * Stripe Checkout Session の UNPAID→PENDING claim
 * (`createCheckoutSessionCommand`) と、`checkout.session.expired` webhook
 * (`claimReservationAsFailed`) のどちらも届かないケース (webhook 未設定 /
 * Cloud Run cold start / Stripe 障害 / ネットワーク断) に対する最終
 * セーフティネット。長時間 PENDING のまま残ると DB EXCLUDE 制約
 * (`reservations_no_active_time_overlap_excl`) が対象時間帯を占有し続け、
 * 他ユーザーの新規予約を silent に阻害するため定期的に自動 CANCELLED 化する。
 *
 * 実際の判定・状態遷移・監査ログ書込は
 * `expireStalePendingReservationsCommand` に集約 (server-only ドメイン層)。
 * cron 経路自体は auth / feature gate / cache invalidation / エラーハンドリングのみ。
 */
export async function GET(request: Request) {
  try {
    await connection();

    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "pendingReservationExpireCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    if (!(await isFeatureEnabled("reservation"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const result = await expireStalePendingReservationsCommand();

    if (result.total > 0) {
      // Reservation 系の全公開キャッシュ (空き状況カレンダー / 予約一覧 /
      // customer 統計) を更新。Route Handler では revalidateTag {expire: 0} を
      // 使う contract (updateTag は Route Handler で throw)。
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.RESERVATIONS,
        CACHE_TAGS.CUSTOMERS,
      ]);
    }

    return jsonSuccess({
      expired: result.total,
      details: result.expired.map((r) => ({
        reservationId: r.id,
        customerId: r.customerId,
        spaceId: r.spaceId,
        ageMinutes: r.ageMinutes,
      })),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "pendingReservationExpireCron" },
    });
    return jsonError("Internal error", 500);
  }
}
