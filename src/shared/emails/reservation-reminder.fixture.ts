import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationReminderEmail } from "./reservation-reminder";

export const reservationReminderFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  startTime: new Date("2026-07-15T13:00:00+09:00"),
  endTime: new Date("2026-07-15T17:00:00+09:00"),
  location: "東京都千代田区千代田1-1-1 デモビル 1F",
  notes: "プロジェクター利用予定",
  cancelUrl:
    "https://example.com/reservation/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  cancellationDeadlineHours: 24,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationReminderEmail>[0];
