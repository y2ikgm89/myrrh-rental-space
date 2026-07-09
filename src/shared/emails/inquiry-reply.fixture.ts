import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { InquiryReplyEmail } from "./inquiry-reply";

export const inquiryReplyFixture = {
  customerName: "山田 太郎",
  originalSubject: "施設利用に関するお問い合わせ",
  originalMessage:
    "来月の研修利用について、空き状況を確認したくご連絡しました。\n希望日時: 2026年8月10日（月）13:00-17:00\n参加人数: 約20名",
  replyMessage:
    "お問い合わせいただきありがとうございます。\nご希望の日時は予約可能ですので、下記より仮押さえをお願いいたします。\n\n https://example.com/reservation\n\nご不明点がありましたらお気軽にご連絡ください。",
  repliedByName: "佐藤（カスタマーサポート）",
  memberInquiryUrl:
    "https://example.com/mypage/inquiries/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof InquiryReplyEmail>[0];
