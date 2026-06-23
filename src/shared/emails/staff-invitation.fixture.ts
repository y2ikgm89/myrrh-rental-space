import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { StaffInvitationEmail } from "./staff-invitation";

export const staffInvitationFixture = {
  staffName: "佐藤 花子",
  setupUrl: "https://example.com/admin/setup/DEMO-TOKEN-DO-NOT-USE",
  expiresAt: new Date("2026-07-20T12:00:00+09:00"),
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof StaffInvitationEmail>[0];
