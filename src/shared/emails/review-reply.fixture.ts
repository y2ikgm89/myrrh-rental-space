import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReviewReplyEmail } from "./review-reply";

export const reviewReplyFixture = {
  customerName: "山田 太郎",
  spaceName: "ミーティングルームA",
  rating: 5,
  originalTitle: "とても使いやすい会議室でした",
  originalComment:
    "清潔感があり、設備も充実していて満足です。\nプロジェクターの調子も良く、研修がスムーズに進みました。",
  replyBody:
    "この度はご利用いただきありがとうございます。\n素敵なレビューをいただけて大変嬉しく思います。\nまたのご来訪を心よりお待ちしております。",
  memberReservationUrl:
    "https://example.com/mypage/reservations/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReviewReplyEmail>[0];
