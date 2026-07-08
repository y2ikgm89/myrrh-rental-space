import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventReminderEmail } from "./event-reminder";

export const eventReminderFixture = {
  customerName: "山田 太郎",
  eventTitle: "夏祭りワークショップ",
  eventDate: "2026年7月15日 (水)",
  startTime: "13:00",
  endTime: "17:00",
  location: "本館 2階 ホール",
  quantity: 2,
  cancelUrl: "https://example.com/events/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventReminderEmail>[0];
