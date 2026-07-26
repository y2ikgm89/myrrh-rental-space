import "server-only";

import { expireOpenCheckoutSessionBestEffort as expireShared } from "@/shared/domain/payment/checkout-session-expiry";

export async function expireOpenCheckoutSessionBestEffort(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  await expireShared({
    sessionId: input.sessionId,
    context: { reservationId: input.reservationId },
  });
}
