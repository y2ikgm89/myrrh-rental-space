"use server";

import { getSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { cancelCustomerReservation } from "@/shared/domain/reservations/customer-commands";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

export async function cancelReservationAction(
  reservationId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "認証が必要です" };

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return { error: "顧客情報が見つかりません" };

  const settings = await getReservationDeadlineSettings();
  const result = await cancelCustomerReservation(
    reservationId,
    customer.id,
    settings.cancellationDeadlineHours,
  );

  if (!result.success) return { error: result.error };

  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.list());
  updateTag(getCacheTag.reservations.calendar());
  return { success: true };
}
