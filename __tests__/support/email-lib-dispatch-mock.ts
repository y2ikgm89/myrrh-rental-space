import { mock } from "bun:test";

const OK_EMAIL_RESULT = { ok: true } as const;

/** domain `lib-dispatch` の named export をすべて提供する stub（部分 mock 禁止）。 */
export function createEmailLibDispatchMockModule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const okAsync = mock(async () => OK_EMAIL_RESULT);
  const noopAsync = mock(async () => undefined);

  return {
    sendWelcomeEmail: okAsync,
    sendChangeEmailVerificationEmail: okAsync,
    sendDeleteAccountVerificationEmail: okAsync,
    sendReviewReplyEmail: okAsync,
    sendReceiptIssuedEmail: okAsync,
    sendReceiptResendEmail: okAsync,
    sendInquiryReplyEmail: okAsync,
    sendInquiryCustomerReplyAdminEmail: okAsync,
    sendInquiryStatusNotificationToAll: noopAsync,
    sendEventRegistrationConfirmation: okAsync,
    sendEventRegistrationCancelled: okAsync,
    sendEventAdminNotification: okAsync,
    sendEventCancelledToAllParticipants: noopAsync,
    sendEventUpdatedToAllParticipants: noopAsync,
    sendEventBroadcast: mock(async () => ({ ok: true, sent: 0, skipped: 0 })),
    sendEventWaitlistRegistered: okAsync,
    sendEventWaitlistOffered: okAsync,
    sendEventWaitlistExpired: okAsync,
    sendReservationConfirmationEmail: noopAsync,
    sendReservationUpdatedEmail: okAsync,
    sendReservationCancelledEmail: okAsync,
    sendReservationStatusChangedEmail: okAsync,
    sendReservationRefundEmail: okAsync,
    sendReservationAdminNotification: okAsync,
    sendBulkReservationCancelledEmail: okAsync,
    sendBulkAdminNotification: okAsync,
    ...overrides,
  };
}

export function installEmailLibDispatchMock(
  overrides: Record<string, unknown> = {},
): void {
  mock.module("@/shared/domain/email/lib-dispatch", () =>
    createEmailLibDispatchMockModule(overrides),
  );
}
