import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { EventAdminNotificationEmail } from "./event-admin-notification";

export const eventAdminNotificationFixture = {
  type: "registration" as const,
  participantName: "山田 太郎",
  participantEmail: "yamada@example.com",
  eventTitle: "ワークショップ：和菓子づくり体験",
  eventDate: "2026年7月20日 (月)",
  quantity: 2,
  currentRegistrations: 12,
  capacity: 20,
  adminUrl:
    "https://example.com/admin/events/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof EventAdminNotificationEmail>[0];
