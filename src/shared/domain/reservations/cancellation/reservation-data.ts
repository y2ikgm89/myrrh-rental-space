import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import type { ReservationEmailData } from "@/shared/lib/email/types";
import type { SideEffectReservation } from "@/shared/domain/reservations/cancellation/types";

export async function fetchReservationForSideEffects(
  reservationId: string,
): Promise<SideEffectReservation | null> {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalPrice: true,
      totalPriceWithTax: true,
      notes: true,
      icsSequence: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      stripeCheckoutSessionId: true,
      googleCalendarEventId: true,
      guestLastName: true,
      guestFirstName: true,
      guestEmail: true,
      customer: {
        select: {
          lastName: true,
          firstName: true,
          companyName: true,
          email: true,
        },
      },
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
    },
  });
}

export function buildEmailPayload(
  reservation: SideEffectReservation,
): ReservationEmailData {
  const guestFull =
    `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim();
  const customerFull =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFull && guestFull !== customerFull ? guestFull : undefined;

  const notes = reservation.notes ?? undefined;
  const location = formatSpaceLineAddress(
    reservation.space.location.address,
    reservation.space.addressDetail,
  );

  return {
    reservationId: reservation.id,
    customerEmail: reservation.guestEmail ?? reservation.customer.email,
    customerName: customerFull || "お客様",
    companyName: reservation.customer.companyName,
    ...(guestNameDiff && { guestName: guestNameDiff }),
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    ...(notes !== undefined && { notes }),
    ...(location !== undefined && { location }),
    icsSequence: reservation.icsSequence,
  };
}
