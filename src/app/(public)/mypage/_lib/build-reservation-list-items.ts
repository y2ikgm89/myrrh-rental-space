import "server-only";

import {
  getReservationCardDeadlineState,
  type ReservationDeadlineSettingsInput,
} from "@/shared/domain/reservations/reservation-card-deadline";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";

export function buildReservationListItems<
  T extends { readonly status: string; readonly startTime: Date },
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
