import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { TestEmail } from "./test-email";

export const testEmailFixture = {
  recipientLabel: "demo@example.com",
  siteName: DEMO_FOOTER.siteName,
  timestamp: new Date("2026-07-15T12:00:00+09:00"),
  triggeredByName: "管理者デモ",
  triggeredByEmail: "admin@example.com",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof TestEmail>[0];
