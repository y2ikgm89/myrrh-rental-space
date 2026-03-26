"use client";

import { Stack } from "@/public/components/design-system/stack";
import { ReservationCard } from "./reservation-card";

interface DeadlineSettings {
  readonly cancellationDeadlineHours: number;
  readonly modificationDeadlineHours: number;
}

interface Reservation {
  readonly id: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

interface ReservationListProps {
  readonly reservations: readonly Reservation[];
  readonly deadlineSettings: DeadlineSettings;
}

export function ReservationList({
  reservations,
  deadlineSettings,
}: ReservationListProps) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center">
        <p className="text-muted-foreground">予約がありません</p>
      </div>
    );
  }

  return (
    <Stack gap="md">
      {reservations.map((reservation) => (
        <ReservationCard
          key={reservation.id}
          reservation={reservation}
          deadlineSettings={deadlineSettings}
        />
      ))}
    </Stack>
  );
}
