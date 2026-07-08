import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventUpdatedNotificationEmail } from "./event-updated-notification";

export const eventUpdatedNotificationFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月) 14:00",
  newEventDate: "2026年7月27日 (月) 14:00〜16:00",
  location: "デモホール B2",
  memberEventRegistrationUrl: "https://example.com/mypage/events",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventUpdatedNotificationEmail>[0];
