import { mock } from "bun:test";

const OK_EMAIL_RESULT = { ok: true } as const;

/** domain `dispatch` の named export をすべて提供する stub（部分 mock 禁止）。 */
export function createEmailDispatchMockModule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const okAsync = mock(async () => OK_EMAIL_RESULT);

  return {
    sendContactConfirmationEmail: okAsync,
    sendContactAdminNotification: okAsync,
    sendCustomerBroadcast: mock(async () => ({
      ok: true as const,
      sent: 0,
      excluded: 0,
    })),
    sendReservationReminderEmail: okAsync,
    sendCalendarSyncRejectionEmail: okAsync,
    sendWebhookRenewalNotification: okAsync,
    ...overrides,
  };
}

export function installEmailDispatchMock(
  overrides: Record<string, unknown> = {},
): void {
  mock.module("@/shared/domain/email/dispatch", () =>
    createEmailDispatchMockModule(overrides),
  );
}
