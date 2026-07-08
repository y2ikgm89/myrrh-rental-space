import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventRegistrationConfirmationEmail } from "./event-registration-confirmation";

const sampleCalendarLinks: AddToCalendarUrls = {
  google:
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88",
  outlookWeb:
    "https://outlook.live.com/calendar/0/deeplink/compose?subject=%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88",
  ics: "https://example.com/api/calendar/event/0123abcd",
};

export const eventRegistrationConfirmationFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  location: "デモホール B2",
  quantity: 2,
  registrationId: "0123ABCD",
  addToCalendarLinks: sampleCalendarLinks,
  cancelUrl: "https://example.com/events/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  claimUrl: "https://example.com/claim/event-registration?token=preview-token",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventRegistrationConfirmationEmail>[0];
