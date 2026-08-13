import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { WelcomeEmail } from "./welcome";

export const welcomeFixture = {
  customerName: "山田 太郎",
  mypageUrl: "https://example.com/mypage",
  siteName: DEMO_FOOTER.siteName,
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof WelcomeEmail>[0];
