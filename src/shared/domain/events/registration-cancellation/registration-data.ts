import "server-only";

import { prisma } from "@/shared/db/prisma";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import type { SideEffectRegistration } from "@/shared/domain/events/registration-cancellation/types";

export type RegistrationEmailDetails = NonNullable<
  Awaited<ReturnType<typeof getEventRegistrationDetailsForEmail>>
>;

export async function fetchRegistrationForSideEffects(
  registrationId: string,
): Promise<SideEffectRegistration | null> {
  return prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      quantity: true,
      icsSequence: true,
      // MYPAGE-EVENT-02: PAID / PARTIALLY_REFUNDED 判定・Stripe refund 起票・
      // policy tier 計算 (slot.startAt = イベント開始時刻) に必要なフィールドを追加。
      paymentStatus: true,
      stripePaymentIntentId: true,
      stripeCheckoutSessionId: true,
      paidAmount: true,
      event: { select: { title: true } },
      slot: { select: { startAt: true } },
    },
  });
}

export async function fetchRegistrationDetailsForSideEffects(
  registrationId: string,
): Promise<RegistrationEmailDetails | null> {
  return getEventRegistrationDetailsForEmail(registrationId);
}
