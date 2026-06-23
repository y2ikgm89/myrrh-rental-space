import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReservationStatusChangedEmail } from "./reservation-status-changed";

const sampleCalendarLinks: AddToCalendarUrls = {
  google:
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=%E3%81%94%E4%BA%88%E7%B4%84",
  outlookWeb:
    "https://outlook.live.com/calendar/0/deeplink/compose?subject=%E3%81%94%E4%BA%88%E7%B4%84",
  ics: "https://example.com/api/calendar/reservation/0123abcd",
};

export const reservationStatusChangedFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "13:00",
  endTime: "17:00",
  totalPrice: "8,000円",
  reservationId: "0123ABCD",
  newStatus: "CONFIRMED",
  location: "東京都千代田区千代田1-1-1 デモビル 1F",
  addToCalendarLinks: sampleCalendarLinks,
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReservationStatusChangedEmail>[0];
