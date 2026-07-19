import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReceiptResendEmail } from "./receipt-resend";

export const receiptResendFixture = {
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  issuedAt: "2026年7月18日",
  amount: "8,800円（うち消費税 800円）",
  serialNo: "2026-000042",
  previousSerialNo: "2026-000012",
  receiptDownloadUrl:
    "https://example.com/api/receipts/2026-000042/pdf?token=DEMO-RECEIPT-TOKEN",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReceiptResendEmail>[0];
