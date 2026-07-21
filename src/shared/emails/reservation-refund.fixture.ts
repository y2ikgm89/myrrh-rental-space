import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationRefundEmail } from "./reservation-refund";

export const reservationRefundFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "14:00",
  endTime: "18:00",
  reservationId: "0123ABCD",
  refundAmount: "¥3,000",
  cumulativeRefundAmount: "¥3,000",
  originalTotal: "¥8,000",
  isFullyRefunded: false,
  reason: "設備トラブルのため一部返金いたしました。",
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationRefundEmail>[0];
