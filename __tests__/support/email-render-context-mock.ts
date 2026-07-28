import { mock } from "bun:test";

export const DEFAULT_EVENT_EMAIL_RENDER_CONTEXT = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Test Org", email: "org@example.com" },
} as const;

export const DEFAULT_RESERVATION_EMAIL_RENDER_CONTEXT = {
  ...DEFAULT_EVENT_EMAIL_RENDER_CONTEXT,
  deadlineSettings: {
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 6,
  },
  cancellationPolicyUrl: undefined,
} as const;

/** `email-render-context` の named export をすべて提供する stub（部分 mock 禁止）。 */
export function createEmailRenderContextMockModule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    resolveEmailTransportContext: mock(async () => ({
      resendApiKey: "re_test_key",
    })),
    isEmailEnabled: mock(async () => true),
    resolveEmailSendContext: mock(async () => ({
      transport: { resendApiKey: "re_test_key" },
      delivery: {
        senderEmail: "noreply@example.com",
        senderName: "Test",
        replyToEmail: null,
      },
      suppressedEmailHashes: new Set<string>(),
    })),
    sendEmail: mock(async () => ({ ok: true })),
    getEventEmailRenderContext: mock(
      async () => DEFAULT_EVENT_EMAIL_RENDER_CONTEXT,
    ),
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
    resolveContactAdminNotificationDelivery: mock(async () => ({
      enabled: true,
      notificationEmails: ["admin@example.com"],
    })),
    resolveContactConfirmationRenderContext: mock(async () => ({})),
    getReminderEmailRenderContext: mock(async () => ({
      calendarSettings: DEFAULT_EVENT_EMAIL_RENDER_CONTEXT.calendarSettings,
      deadlineSettings: { cancellationDeadlineHours: 24 },
      organizer: DEFAULT_EVENT_EMAIL_RENDER_CONTEXT.organizer,
    })),
    resolveSystemNotificationDelivery: mock(async () => ({
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
