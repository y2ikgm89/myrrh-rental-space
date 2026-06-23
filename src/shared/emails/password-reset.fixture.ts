import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { PasswordResetEmail } from "./password-reset";

export const passwordResetFixture = {
  name: "山田 太郎",
  resetUrl: "https://example.com/reset-password?token=DEMO-TOKEN-DO-NOT-USE",
  siteName: DEMO_FOOTER.siteName,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof PasswordResetEmail>[0];
