import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventWaitlistOfferedEmail } from "./event-waitlist-offered";

/** 無料イベント: confirmUrl・priceDisplay なし。 */
export const eventWaitlistOfferedFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  quantity: 2,
  expiresAtDate: "2026年7月21日 (火)",
  expiresAtTime: "14:00",
  actionUrl: "https://example.com/events/waitlist/confirm?token=preview-token",
  isPaid: false,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventWaitlistOfferedEmail>[0];

/** 有料イベント: checkoutUrl・priceDisplay あり。 */
export const eventWaitlistOfferedPaidFixture = {
  customerName: "山田 太郎",
  eventTitle: "特別講演会：陶芸家に学ぶ一日",
  eventDate: "2026年7月25日 (土)",
  startTime: "10:00",
  endTime: "12:00",
  quantity: 1,
  expiresAtDate: "2026年7月26日 (日)",
  expiresAtTime: "10:00",
  actionUrl: "https://example.com/events/waitlist/checkout/preview-token",
  isPaid: true,
  priceDisplay: "¥3,000",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventWaitlistOfferedEmail>[0];
