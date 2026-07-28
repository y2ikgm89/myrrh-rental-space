import { mock } from "bun:test";

export const DEFAULT_RESERVATION_EMAIL_RENDER_CONTEXT = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Test Org", email: "org@example.com" },
  deadlineSettings: { cancellationDeadlineHours: 24 },
  cancellationPolicyUrl: undefined,
} as const;

/** `email-render-context` の named export をすべて提供する stub（部分 mock 禁止）。 */
export function createEmailRenderContextMockModule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    getEventEmailRenderContext: mock(async () => ({
      calendarSettings:
        DEFAULT_RESERVATION_EMAIL_RENDER_CONTEXT.calendarSettings,
      organizer: DEFAULT_RESERVATION_EMAIL_RENDER_CONTEXT.organizer,
    })),
    getReservationEmailRenderContext: mock(
      async () => DEFAULT_RESERVATION_EMAIL_RENDER_CONTEXT,
    ),
    isReservationConfirmationEmailEnabled: mock(async () => true),
    isEventAdminNotificationEnabled: mock(() => true),
    resolveEventAdminNotificationDelivery: mock(async () => ({
      enabled: true,
      notificationEmails: ["admin@example.com"],
    })),
    isReservationAdminNotificationEnabled: mock(() => true),
    resolveReservationAdminNotificationDelivery: mock(async () => ({
      enabled: true,
      notificationEmails: ["admin@example.com"],
    })),
    resolveInquiryCustomerReplyAdminDelivery: mock(async () => ({
      enabled: true,
      notificationEmails: ["admin@example.com"],
    })),
    ...overrides,
  };
}

export function installEmailRenderContextMock(
  overrides: Record<string, unknown> = {},
): void {
  mock.module("@/shared/domain/settings/queries/email-render-context", () =>
    createEmailRenderContextMockModule(overrides),
  );
}
