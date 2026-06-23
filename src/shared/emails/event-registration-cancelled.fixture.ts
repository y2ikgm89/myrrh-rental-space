import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventRegistrationCancelledEmail } from "./event-registration-cancelled";

export const eventRegistrationCancelledFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventRegistrationCancelledEmail>[0];
