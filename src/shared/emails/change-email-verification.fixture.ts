import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { ChangeEmailVerificationEmail } from "./change-email-verification";

export const changeEmailVerificationFixture = {
  name: "山田 太郎",
  newEmail: "new-address@example.com",
  verificationUrl:
    "https://example.com/mypage/settings/confirm-email?token=DEMO-TOKEN-DO-NOT-USE",
  siteName: DEMO_FOOTER.siteName,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof ChangeEmailVerificationEmail>[0];
