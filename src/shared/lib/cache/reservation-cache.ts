import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

type InvalidateReservationCachesOptions = {
  readonly coupons?: boolean;
};

export function invalidateReservationCaches(
  reservationId: string,
  customerId: string | null,
  options: InvalidateReservationCachesOptions = {},
): void {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(reservationId));
  updateTag(getCacheTag.reservations.calendar());
  updateTag(CACHE_TAGS.CUSTOMERS);
  if (customerId) {
    updateTag(getCacheTag.customers.detail(customerId));
  }
  if (options.coupons) {
    updateTag(CACHE_TAGS.COUPONS);
  }
}

type InvalidateReservationSeriesCachesOptions = {
  readonly coupons?: boolean;
  /**
   * series 配下の instance 予約 ID 群。渡された各 id に対して
   * `getCacheTag.reservations.detail(id)` を dispatch する。
   *
   * seriesId をここに渡すのは NG (`reservations-<seriesId>` は producer なしの
   * dead tag になり、将来 detail-only invalidator を分離した瞬間 silent stale)。
   * 未確定 (customer 経路で command 返り値経由の取得が難しい) の場合は
   * 省略可: そのときは site-wide `RESERVATIONS` / calendar / customer detail
   * だけで invalidate する保守的 fallback で 済ませる。
   */
  readonly instanceIds?: readonly string[];
};

/**
 * ReservationSeries 単位のキャンセル/更新後に呼ぶキャッシュ無効化ヘルパー。
 *
 * 既存の `invalidateReservationCaches` を series 経路で流用すると、seriesId が
 * `reservationId` slot に流れ込み `reservations-<seriesId>` という dead tag が
 * emit される (`getCacheTag.reservations.detail` の producer は Reservation
 * detail 側のみ)。site-wide `RESERVATIONS` タグでも invalidate 対象は覆えるが、
 * 「series の場所には series 用の呼び分けを持つ」構造にしておかないと、
 * detail-only invalidator を分離した瞬間 silent stale になる (CRITIC-5)。
 *
 * この関数は series scope で確実に無効化すべきタグ (site-wide list / calendar /
 * customer / 各 instance detail) だけを dispatch する。dead tag は emit しない。
 */
export function invalidateReservationSeriesCaches(
  _seriesId: string,
  customerId: string | null,
  options: InvalidateReservationSeriesCachesOptions = {},
): void {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.calendar());
  updateTag(CACHE_TAGS.CUSTOMERS);
  if (customerId) {
    updateTag(getCacheTag.customers.detail(customerId));
  }
  if (options.instanceIds) {
    for (const instanceId of options.instanceIds) {
      updateTag(getCacheTag.reservations.detail(instanceId));
    }
  }
  if (options.coupons) {
    updateTag(CACHE_TAGS.COUPONS);
  }
}
