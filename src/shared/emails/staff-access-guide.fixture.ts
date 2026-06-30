import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { StaffAccessGuideEmail } from "./staff-access-guide";

export const staffAccessGuideFixture = {
  staffName: "佐藤 花子",
  staffEmail: "staff@example.com",
  roleLabel: "編集者",
  adminUrl: "https://admin.example.com/admin",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof StaffAccessGuideEmail>[0];
