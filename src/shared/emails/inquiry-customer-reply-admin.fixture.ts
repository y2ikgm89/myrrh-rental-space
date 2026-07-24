import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { InquiryCustomerReplyAdminEmail } from "./inquiry-customer-reply-admin";

export const inquiryCustomerReplyAdminFixture = {
  customerName: "山田 太郎",
  receiptNumber: "INQ-ABCD1234",
  subject: "施設利用に関するお問い合わせ",
  replyMessage:
    "先日の回答を確認しました。追加で、8月10日の利用時間を17:00まで延長することは可能でしょうか。",
  adminUrl:
    "https://example.com/admin/inquiries/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof InquiryCustomerReplyAdminEmail>[0];
