import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventWaitlistRegisteredEmail } from "./event-waitlist-registered";

export const eventWaitlistRegisteredFixture = {
  customerName: "山田 太郎",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  quantity: 2,
  ticketName: "一般チケット",
  position: 3,
  memberEventRegistrationUrl: "https://example.com/mypage/events",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventWaitlistRegisteredEmail>[0];

/**
 * ゲスト（未ログイン）向け: claimUrl 分岐の確認用バリエーション。
 *
 * `exactOptionalPropertyTypes: true` のため、member 版から spread した上で
 * `memberEventRegistrationUrl: undefined` を明示代入することはできない
 * （optional プロパティへの `undefined` 明示代入は型エラー）。そのため
 * キー自体を持たない独立した object literal として定義する。
 */
export const eventWaitlistRegisteredGuestFixture = {
  customerName: "鈴木 花子",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  quantity: 1,
  ticketName: "一般チケット",
  position: 5,
  claimUrl: "https://example.com/claim/event-registration?token=preview-token",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventWaitlistRegisteredEmail>[0];
