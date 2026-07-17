import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventBroadcastEmail } from "./event-broadcast";

export const eventBroadcastFixture = {
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventUrl: "https://example.com/events/wagashi-workshop",
  subject: "【重要】明日の集合場所についてのお知らせ",
  bodyText:
    "参加者の皆さまへ\n\nお世話になっております。運営の田中です。\n明日開催のワークショップにつきまして、集合場所の変更をお知らせいたします。\n\n変更前: 会場正面玄関\n変更後: 会場裏手の職員通用口 (地図: https://example.com/map)\n\n受付は開始15分前から行います。\n当日はお気をつけてお越しください。",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventBroadcastEmail>[0];
