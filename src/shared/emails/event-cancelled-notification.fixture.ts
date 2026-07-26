import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventCancelledNotificationEmail } from "./event-cancelled-notification";

export const eventCancelledNotificationFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  reason: "講師の都合により開催を中止させていただきます。",
  eventRegistrationHubUrl:
    "https://example.com/mypage/events/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventCancelledNotificationEmail>[0];
