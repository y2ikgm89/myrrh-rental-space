import "server-only";

import {
  getReservationCardDeadlineState,
  type ReservationDeadlineSettingsInput,
} from "@/shared/domain/reservations/reservation-card-deadline";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

export function buildReservationListItems<
  T extends {
    readonly status: string;
    readonly startTime: Date;
    readonly paymentStatus: PaymentStatus;
    readonly couponDiscountAmount?: number | null;
    readonly durationDiscountAmount?: number | null;
    readonly spaceDiscountAmount?: number | null;
  },
>(
  reservations: readonly T[],
  deadlineSettings: ReservationDeadlineSettingsInput,
): ReadonlyArray<{
  readonly reservation: T;
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly showPastDeadlineMessage: boolean;
}> {
  const now = reservationDeadlineNow();
  return reservations.map((reservation) => ({
    reservation,
    ...getReservationCardDeadlineState(reservation, deadlineSettings, now),
  }));
}
