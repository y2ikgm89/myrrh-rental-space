import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { InquiryStatusNotificationEmail } from "./inquiry-status-notification";

export const inquiryStatusNotificationFixture = {
  customerName: "山田 太郎",
  inquirySubject: "施設利用に関するお問い合わせ",
  newStatus: "RESOLVED" as const,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof InquiryStatusNotificationEmail>[0];
