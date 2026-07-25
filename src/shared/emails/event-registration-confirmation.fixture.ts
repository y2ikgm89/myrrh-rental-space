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
  format: "OFFLINE" as const,
  meetingUrl: null,
  quantity: 2,
  registrationId: "0123ABCD",
  addToCalendarLinks: sampleCalendarLinks,
  memberEventRegistrationUrl: "https://example.com/mypage/events",
  cancelUrl: "https://example.com/events/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  claimUrl: "https://example.com/claim/event-registration?token=preview-token",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventRegistrationConfirmationEmail>[0];

/**
 * Phase B.1: ONLINE 開催イベントの申込確認 fixture。
 * 「オンライン参加 URL」section の表示確認用（unit test で使用。`bun run email:dev` の
 * プレビューは `PreviewProps`（上記デフォルト = OFFLINE）のみを表示するため、この
 * variant を目視確認する場合は `PreviewProps` を一時的にこちらへ差し替える）。
 * 物理会場を持たないため `location` は指定しない。
 */
export const eventRegistrationConfirmationOnlineFixture = {
  customerName: "山田 太郎",
  eventTitle: "オンラインセミナー：Web集客の基礎",
  eventDate: "2026年7月20日 (月)",
  startTime: "14:00",
  endTime: "16:00",
  format: "ONLINE" as const,
  meetingUrl: "https://meet.google.com/example",
  quantity: 2,
  registrationId: "0456EFGH",
  addToCalendarLinks: sampleCalendarLinks,
  memberEventRegistrationUrl: "https://example.com/mypage/events",
  cancelUrl: "https://example.com/events/cancel?token=DEMO-TOKEN-DO-NOT-USE",
  claimUrl: "https://example.com/claim/event-registration?token=preview-token",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventRegistrationConfirmationEmail>[0];
