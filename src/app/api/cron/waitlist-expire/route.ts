import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { findExpiredWaitlistOfferCandidates } from "@/shared/domain/events/waitlist-queries";
import { expireAndPromoteWaitlistForEventCommand } from "@/shared/domain/events/waitlist-commands";
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

// TODO(task-6): src/shared/lib/email/event-waitlist-emails.ts
// (sendEventWaitlistExpired / sendEventWaitlistOffered /
// getEventWaitlistOfferPaymentContext) が追加されたら、下のループ内で event 単位の
// result.expired[] / result.offered[] を fireAndForget 送信する。Task 5 時点では
// そのモジュールがまだ存在しないため、advisory lock によるバッチ処理自体は完成
// させつつメール送信のみ意図的に保留する（cron のロック/状態遷移ロジックを
// 未実装の Task 6 import でブロックしないため）。

/**
 * Waitlist offer（`WAITLISTED_OFFERED`）の 24h TTL 期限切れ cron。hourly 実行。
 *
 * 期限切れになった申込を `EXPIRED` にし、空いた (slotId, ticketId) 枠に次の
 * `WAITLISTED` を FIFO で繰り上げる。event 単位で advisory session lock
 * (728354、`waitlist-locks.ts`) を握ってから処理するため、同一 event を 2
 * プロセスが同時に走査しても updateMany claim の順序が非決定にならない。
 *
 * 実際の transaction 開始・lock acquire/release・状態遷移は
 * `expireAndPromoteWaitlistForEventCommand`（server-only ドメイン層）に集約する。
 * `src/app/*` から Prisma を直接 import しない CLAUDE.md 規約のため、この Route
 * Handler 自体は Prisma に触れない。cron 経路は auth / feature gate / event 単位
 * グルーピング / cache invalidation / エラーハンドリングのみを担う
 * （`event-reminder` / `pending-reservation-expire` と同型の薄い cron shape）。
 */
export async function GET(request: Request) {
  try {
    await connection();

    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "waitlistExpireCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // Feature module gate — events OFF なら早期 return
    if (!(await isFeatureEnabled("events"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const now = new Date();
    const candidates = await findExpiredWaitlistOfferCandidates(now);

    // advisory session lock (728354) が event scope のため、event 単位で
    // グルーピングしてから 1 event = 1 $transaction で処理する。
    const byEvent = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const bucket = byEvent.get(candidate.eventId);
      if (bucket) {
        bucket.push(candidate);
      } else {
        byEvent.set(candidate.eventId, [candidate]);
      }
    }

    let expired = 0;
    let offered = 0;

    for (const [eventId, group] of byEvent) {
      try {
        const result = await expireAndPromoteWaitlistForEventCommand({
          eventId,
          candidates: group,
          now,
        });
        expired += result.expired.length;
        offered += result.offered.length;

        // TODO(task-6): result.expired → sendEventWaitlistExpired、
        // result.offered → sendEventWaitlistOffered (+
        // getEventWaitlistOfferPaymentContext) を fireAndForget で送信する。
      } catch (error) {
        // 1 event の失敗（例: ロック競合による $transaction timeout）で
        // 残り event の処理を止めない。outer catch へ伝播させず次の event へ
        // 継続する（outer catch は findExpiredWaitlistOfferCandidates 自体の
        // 失敗など、event 単位に切り分けられない致命的な失敗専用に残す）。
        logError(error, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "waitlistExpireCron",
            eventId,
            candidateCount: group.length,
          },
        });
      }
    }

    if (expired > 0 || offered > 0) {
      // Route Handler では revalidateTag {expire: 0} 経路（updateTag は throw する）。
      // TODO(task-12): CACHE_TAGS.EVENT_WAITLIST 追加後はここに含める。
      invalidateSiteWideCacheFromRouteHandler([CACHE_TAGS.EVENTS]);
    }

    return jsonSuccess({ expired, offered });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "waitlistExpireCron" },
    });
    return jsonError("Internal error", 500);
  }
}
