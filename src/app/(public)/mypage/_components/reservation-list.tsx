"use client";

import Link from "next/link";
import { Stack } from "@/public/components/design-system/stack";
import { ReservationCard } from "./reservation-card";

interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly paymentStatus: string;
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
      <div className="py-16 md:py-24 text-center space-y-3">
        <p className="text-sm text-muted-foreground">予約がありません</p>
        <Link
          href="/spaces"
          className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          スペースを探す
        </Link>
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
