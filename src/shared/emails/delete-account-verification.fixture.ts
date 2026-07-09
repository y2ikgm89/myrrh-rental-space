import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { DeleteAccountVerificationEmail } from "./delete-account-verification";

export const deleteAccountVerificationFixture = {
  name: "山田 太郎",
  deletionUrl:
    "https://example.com/api/customer-auth/delete-user/callback?token=DEMO-TOKEN-DO-NOT-USE",
  siteName: DEMO_FOOTER.siteName,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof DeleteAccountVerificationEmail>[0];
