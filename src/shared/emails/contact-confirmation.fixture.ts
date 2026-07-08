import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ContactConfirmationEmail } from "./contact-confirmation";

export const contactConfirmationFixture = {
  name: "山田 太郎",
  subject: "施設利用に関するお問い合わせ",
  message:
    "お世話になります。\n来月の研修利用について、空き状況を確認したくご連絡しました。\n\n希望日時: 2026年8月10日（月）13:00-17:00\n参加人数: 約20名\n\nご返答お待ちしております。",
  memberInquiryUrl:
    "https://example.com/mypage/inquiries/abcdef-0123-4567-89ab-cdef01234567",
  privacyPolicyUrl: "https://example.com/terms/privacy-policy",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ContactConfirmationEmail>[0];
