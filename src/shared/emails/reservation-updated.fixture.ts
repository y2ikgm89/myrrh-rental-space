import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationUpdatedEmail } from "./reservation-updated";

const sampleCalendarLinks: AddToCalendarUrls = {
  google:
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=%E3%81%94%E4%BA%88%E7%B4%84",
  outlookWeb:
    "https://outlook.live.com/calendar/0/deeplink/compose?subject=%E3%81%94%E4%BA%88%E7%B4%84",
  ics: "https://example.com/api/calendar/reservation/0123abcd",
};

export const reservationUpdatedFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "14:00",
  endTime: "18:00",
  totalPrice: "8,000円",
  reservationId: "0123ABCD",
  notes: "プロジェクターの利用をお願いします。",
  addToCalendarLinks: sampleCalendarLinks,
  cancelUrl:
    "https://example.com/reservation/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  cancellationDeadlineHours: 24,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationUpdatedEmail>[0];
