import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ReceiptIssuedEmail } from "./receipt-issued";

export const receiptIssuedFixture = {
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  issuedAt: "2026年7月26日",
  amount: "8,800円（うち消費税 800円）",
  serialNo: "2026-000042",
  detailUrl: "https://example.com/mypage/reservations/res_demo_001",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ReceiptIssuedEmail>[0];
