import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { CustomerMergeVerificationEmail } from "./customer-merge-verification";

export const customerMergeVerificationFixture = {
  name: "山田 太郎",
  guestEmail: "guest-history@example.com",
  verificationUrl:
    "https://example.com/mypage/merge/confirm?token=DEMO-TOKEN-DO-NOT-USE",
  reservationCount: 2,
  inquiryCount: 1,
  reviewCount: 0,
  registrationCount: 1,
  siteName: DEMO_FOOTER.siteName,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof CustomerMergeVerificationEmail>[0];
