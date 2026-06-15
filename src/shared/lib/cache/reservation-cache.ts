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
