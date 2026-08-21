import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";
import { ReservationCard } from "./reservation-card";
import type {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: ReservationStatus;
  readonly totalPriceWithTax: number | null;
  readonly paymentStatus: PaymentStatus;
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
  /** Feature module gates for empty-state CTAs (F-103). */
  readonly showSpacesLink?: boolean;
  readonly showFaqLink?: boolean;
}

export function ReservationList({
  items,
  showSpacesLink = false,
  showFaqLink = false,
}: ReservationListProps) {
  if (items.length === 0) {
    return (
      <div className="space-y-4 py-12 text-center md:py-16">
        <p className="text-muted-foreground">予約がありません</p>
        {(showSpacesLink || showFaqLink) && (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {showSpacesLink ? (
              <Button variant="editorial" size="sm" href="/spaces">
                スペースを探す
              </Button>
            ) : null}
            {showFaqLink ? (
              <Button variant="editorial" size="sm" href="/faq">
                よくある質問を見る
              </Button>
            ) : null}
          </div>
        )}
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
