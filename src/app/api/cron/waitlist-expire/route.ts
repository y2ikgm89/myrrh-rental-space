import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  findExpiredWaitlistOfferCandidates,
  findWaitlistBacklogGroups,
  getEventWaitlistOfferPaymentContext,
  getWaitlistEmailRegistration,
} from "@/shared/domain/events/waitlist-queries";
import {
  expireAndPromoteWaitlistForEventCommand,
  offerWaitlistUpToCapacityForEventCommand,
} from "@/shared/domain/events/waitlist-commands";
import {
  sendEventWaitlistExpired,
  sendEventWaitlistOffered,
} from "@/shared/domain/email/lib-dispatch";
import { fireEventWaitlistOfferedAdminNotification } from "@/shared/domain/events/waitlist-admin-notification-side-effects";
import { fireAndForget } from "@/shared/lib/async-utils";
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
 * 繰り上げ当選通知（cancel 駆動の自動昇格・admin 手動昇格と同じ契約）。
 *
 * 期限切れ駆動の昇格と空き容量 backfill の 2 経路が同じ通知を出すので、
 * ここに 1 本化する。片方だけ直して通知が食い違う事故を構造的に防ぐ。
 */
function dispatchWaitlistOfferEmails(
  eventId: string,
  offered: readonly {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  }[],
): void {
  for (const offeredEntry of offered) {
    if (!offeredEntry.email) {
      fireEventWaitlistOfferedAdminNotification(offeredEntry.id);
      continue;
    }
    const email = offeredEntry.email;
    fireAndForget(
      (async () => {
        const [registration, paymentContext] = await Promise.all([
          getWaitlistEmailRegistration(offeredEntry.id),
          getEventWaitlistOfferPaymentContext(offeredEntry.id),
        ]);
        if (!registration || !paymentContext) {
          if (!paymentContext) {
            logError(
              new Error(
                `Waitlist offer payment context not found after cron promote: registration ${offeredEntry.id}`,
              ),
              {
                category: ErrorCategory.DATABASE,
                severity: ErrorSeverity.LOW,
                context: {
                  operation: "waitlistExpireCron",
                  registrationId: offeredEntry.id,
                  eventId,
                },
              },
            );
          }
          return;
        }
        await sendEventWaitlistOffered({
          registration,
          to: email,
          expiresAt: offeredEntry.expiresAt,
          paymentContext,
        });
        fireEventWaitlistOfferedAdminNotification(offeredEntry.id);
      })(),
      {
        operation: "sendEventWaitlistOfferedFromCron",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { registrationId: offeredEntry.id, eventId },
      },
    );
  }
}
/**
 * Waitlist offer（`WAITLISTED_OFFERED`）の 24h TTL 期限切れ cron。hourly 実行。
 *
 * 期限切れになった申込を `EXPIRED` にし、空いた (slotId, ticketId) 枠に次の
 * `WAITLISTED` を FIFO で繰り上げる。event 単位で
 * `waitlist_promote_leased_until` 行リースを握ってから処理するため、同一
 * event を 2 プロセスが同時に走査しても updateMany claim の順序が非決定に
 * ならない。`728354` は旧 session lock の採番で、再利用しない。
 *
 * ## 2 パス構成
 *
 * 1. 期限切れ offer を EXPIRED にし、空いた枠へ FIFO で 1 件昇格する
 *    （`expireAndPromoteWaitlistForEventCommand`）
 * 2. **空いている席の数だけ**待機者を FIFO で昇格する
 *    （`offerWaitlistUpToCapacityForEventCommand`）。1 パス目は期限切れ offer が
 *    無いイベントを訪問しないので、`quantity: 3` のキャンセルで空いた 3 席のうち
 *    2 席が誰にも案内されないまま残っていた。
 *
 * 実際の transaction 開始・lock acquire/release・状態遷移は
 * `expireAndPromoteWaitlistForEventCommand`（server-only ドメイン層）に集約する。
 * `src/app/*` から Prisma を直接 import しない規約のため、この Route
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

        // 期限切れ通知（cron の EXPIRED 遷移は admin 手動 expire
        // (adminExpireWaitlistOfferAction) と同じ「遷移したら必ず通知する」契約）。
        // email が null（waitlist 登録は公開フォーム側で必須のため実運用では
        // 発生しない想定）の候補は静かに skip する。
        for (const expiredEntry of result.expired) {
          if (!expiredEntry.email) continue;
          const email = expiredEntry.email;
          fireAndForget(
            (async () => {
              const registration = await getWaitlistEmailRegistration(
                expiredEntry.id,
              );
              if (!registration) return;
              await sendEventWaitlistExpired({
                registration,
                to: email,
              });
            })(),
            {
              operation: "sendEventWaitlistExpiredFromCron",
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.MEDIUM,
              context: { registrationId: expiredEntry.id, eventId },
            },
          );
        }

        dispatchWaitlistOfferEmails(eventId, result.offered);
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

    // 2 パス目: 空いている席の数だけ FIFO で offer する（backfill）。
    //
    // 1 パス目は「期限切れの offer」駆動なので、席は空いているのに未処理の
    // offer が無いイベントを 1 度も訪問しない。`quantity: 3` の申込が 1 件
    // キャンセルされると 3 席空くのに offer は 1 件だけ出て、**残り 2 席は
    // 次のキャンセルが来るまで誰にも案内されない**。
    //
    // 原因を問わず「いま空いている席」を見るので、キャンセル・未払い期限切れ・
    // 管理者の定員引き上げ・手動 expire のどれで空いても拾える。
    //
    // 1 パス目の直後に走らせる。1 パス目が EXPIRED 化して空けた席も同じ tick で
    // 埋まる（リースは event ごとに取得・解放するので競合しない）。
    const backlog = await findWaitlistBacklogGroups();
    const backlogByEvent = new Map<
      string,
      { slotId: string; ticketId: string }[]
    >();
    for (const group of backlog) {
      const bucket = backlogByEvent.get(group.eventId);
      if (bucket) {
        bucket.push({ slotId: group.slotId, ticketId: group.ticketId });
      } else {
        backlogByEvent.set(group.eventId, [
          { slotId: group.slotId, ticketId: group.ticketId },
        ]);
      }
    }

    for (const [eventId, groups] of backlogByEvent) {
      try {
        const result = await offerWaitlistUpToCapacityForEventCommand({
          eventId,
          groups,
          now,
        });
        offered += result.offered.length;
        dispatchWaitlistOfferEmails(eventId, result.offered);
      } catch (error) {
        // 1 event の失敗で残りを止めない（1 パス目と同じ方針）。
        logError(error, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "waitlistBackfillCron",
            eventId,
            groupCount: groups.length,
          },
        });
      }
    }

    if (expired > 0 || offered > 0) {
      // Route Handler では revalidateTag {expire: 0} 経路（updateTag は throw する）。
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.EVENTS,
        CACHE_TAGS.EVENT_WAITLIST,
      ]);
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
