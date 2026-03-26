"use client";

import { Stack } from "@/public/components/design-system/stack";
import { ReservationCard } from "./reservation-card";

interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

export interface ReservationListItem {
  readonly reservation: Reservation;
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly showPastDeadlineMessage: boolean;
}

interface ReservationListProps {
  readonly items: readonly ReservationListItem[];
}

export function ReservationList({ items }: ReservationListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center">
        <p className="text-muted-foreground">予約がありません</p>
      </div>
    );
  }

  return (
    <Stack gap="md">
      {items.map(
        ({ reservation, canModify, canCancel, showPastDeadlineMessage }) => (
          <ReservationCard
            key={reservation.id}
            reservation={reservation}
            canModify={canModify}
            canCancel={canCancel}
            showPastDeadlineMessage={showPastDeadlineMessage}
          />
        ),
      )}
    </Stack>
  );
}
