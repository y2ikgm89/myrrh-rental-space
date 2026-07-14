import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventWaitlistExpiredEmail } from "./event-waitlist-expired";

export const eventWaitlistExpiredFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventUrl: "https://example.com/events/summer-workshop",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventWaitlistExpiredEmail>[0];
