"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
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
    execute: async () =>
      createCheckoutSessionCommand({ reservationId, actorCustomerId: null }),
    afterSuccess: (data) => {
      invalidateReservationCaches(reservationId, data.customerId);
    },
  });
}

export async function refundReservationPayment(
  reservationId: string,
): Promise<MutationResult<{ refundId: string; status: string | null }>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () => {
      const result = await refundReservationPaymentCommand(reservationId);
      return result;
    },
    afterSuccess: (data) => {
      invalidateReservationCaches(reservationId, data.customerId);
    },
  });
}
