import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventRegistrationUpdatedEmail } from "./event-registration-updated";

export const eventRegistrationUpdatedFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  ticketName: "一般",
  quantity: 2,
  totalPrice: "¥6,000",
  registrationId: "c08ed19d-5ef4-4103-876b-8668a23ffc02",
  eventRegistrationHubUrl:
    "https://example.com/events/registrations/status?token=demo",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventRegistrationUpdatedEmail>[0];
