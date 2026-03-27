"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCheckoutSessionCommand,
  refundReservationPaymentCommand,
} from "@/shared/domain/reservations/payment-commands";

export async function createCheckoutSession(
  reservationId: string,
): Promise<MutationResult<{ sessionId: string; sessionUrl: string | null }>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () => createCheckoutSessionCommand(reservationId),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(reservationId));
    },
  });
}

export async function refundReservationPayment(
  reservationId: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () => {
      await refundReservationPaymentCommand(reservationId);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(reservationId));
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
  });
}
