import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationCancelledEmail } from "./reservation-cancelled";

export const reservationCancelledFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "13:00",
  endTime: "17:00",
  reservationId: "0123ABCD",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationCancelledEmail>[0];
