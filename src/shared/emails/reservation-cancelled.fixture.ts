import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationCancelledEmail } from "./reservation-cancelled";

export const reservationCancelledFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "13:00",
  endTime: "17:00",
  reservationId: "0123ABCD",
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  cancellationPolicyUrl: "https://example.com/terms/cancellation-policy",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationCancelledEmail>[0];
