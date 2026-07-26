import "server-only";

import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

/**
 * 予約キャッシュを無効化（共通）
 *
 * webhook では `revalidateTag(tag, CACHE_LIFE.DYNAMIC_DATA)` の SWR ではなく
 * `invalidateSiteWideCacheFromRouteHandler` 経由の `{expire:0}` を使う。
 * Stripe 公式 fulfillment ガイドラインに沿った即時反映のため。
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
export function invalidateReservationCache(reservationId: string): void {
  // skipCdnPurge: true — RESERVATIONS + detail + calendar は全て admin-only の
  // private tag (NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist)。CDN 経路に emit されない
  // ため、SITEMAP co-purge を Cloudflare に飛ばす意味が無く、purge quota を
  // 不必要に消費する (Codex PR #945 review 対応)。
  invalidateSiteWideCacheFromRouteHandler(
    [
      CACHE_TAGS.RESERVATIONS,
      getCacheTag.reservations.detail(reservationId),
      getCacheTag.reservations.calendar(),
    ],
    { skipCdnPurge: true },
  );
}

/**
 * イベント申込キャッシュを無効化（共通）
 *
 * `CACHE_TAGS.EVENTS` は公開イベント一覧/詳細ページの CDN tag にもマップされている
 * （`confirmWaitlistOfferAction` が
 * `invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.EVENT_WAITLIST])` を
 * `skipCdnPurge` 無しで呼ぶのと同じ理由 — Reservation 側の `invalidateReservationCache`
 * とは異なり、こちらは `skipCdnPurge: true` を **渡さない**。予約タグは admin-only の
 * private tag だが、イベントタグは公開ページに影響するため CDN purge が必要）。
 *
 * `CACHE_TAGS.EVENT_WAITLIST` も無条件で含める: waitlist offer 経由の PAID 確定
 * （`isWaitlistOffer` 分岐、WAITLISTED_OFFERED → CONFIRMED）は
 * `confirmWaitlistOfferAction`（無料チケット）と同じ状態遷移の有料版のため対称に
 * 揃える。直接購入（`isWaitlistOffer === false`）では no-op だが、
 * EVENT_WAITLIST に producer が無いため過剰無効化のコストは無い。
 */
export function invalidateEventRegistrationCache(): void {
  invalidateSiteWideCacheFromRouteHandler([
    CACHE_TAGS.EVENTS,
    CACHE_TAGS.EVENT_WAITLIST,
  ]);
}
