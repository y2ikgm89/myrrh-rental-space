import "server-only";

import {
  expireOpenCheckoutSessionBestEffort as expireShared,
  retrieveCheckoutSessionStatus as retrieveShared,
} from "@/shared/domain/payment/checkout-session-expiry";

export async function expireOpenCheckoutSessionBestEffort(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  await expireShared({
    sessionId: input.sessionId,
    context: { reservationId: input.reservationId },
  });
}

export async function retrieveCheckoutSessionStatus(
  sessionId: string,
): Promise<string | null> {
  return retrieveShared(sessionId);
}
