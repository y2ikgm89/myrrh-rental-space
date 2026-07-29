import "server-only";

import { sendChangeEmailVerificationEmail as sendChangeEmailVerificationEmailLib } from "@/shared/lib/email/change-email-emails";
import { sendDeleteAccountVerificationEmail as sendDeleteAccountVerificationEmailLib } from "@/shared/lib/email/delete-account-emails";
import {
  sendEventAdminNotification as sendEventAdminNotificationLib,
  sendEventBroadcast as sendEventBroadcastLib,
  sendEventCancelledToAllParticipants as sendEventCancelledToAllParticipantsLib,
  sendEventRegistrationCancelled as sendEventRegistrationCancelledLib,
  sendEventRegistrationConfirmation as sendEventRegistrationConfirmationLib,
  sendEventRegistrationUpdated as sendEventRegistrationUpdatedLib,
  sendEventUpdatedToAllParticipants as sendEventUpdatedToAllParticipantsLib,
  type EventBroadcastResult,
} from "@/shared/lib/email/event-emails";
import {
  sendEventWaitlistExpired as sendEventWaitlistExpiredLib,
  sendEventWaitlistOffered as sendEventWaitlistOfferedLib,
  sendEventWaitlistRegistered as sendEventWaitlistRegisteredLib,
} from "@/shared/lib/email/event-waitlist-emails";
import {
  sendInquiryCustomerReplyAdminEmail as sendInquiryCustomerReplyAdminEmailLib,
  sendInquiryReplyEmail as sendInquiryReplyEmailLib,
  sendInquiryStatusNotificationToAll as sendInquiryStatusNotificationToAllLib,
} from "@/shared/lib/email/inquiry-emails";
import {
  sendReceiptIssuedEmail as sendReceiptIssuedEmailLib,
  sendReceiptResendEmail as sendReceiptResendEmailLib,
} from "@/shared/lib/email/receipt-emails";
import {
  sendBulkAdminNotification as sendBulkAdminNotificationLib,
  sendBulkReservationCancelledEmail as sendBulkReservationCancelledEmailLib,
  sendReservationAdminNotification as sendReservationAdminNotificationLib,
  sendReservationCancelledEmail as sendReservationCancelledEmailLib,
  sendReservationConfirmationEmail as sendReservationConfirmationEmailLib,
  sendReservationRefundEmail as sendReservationRefundEmailLib,
  sendReservationStatusChangedEmail as sendReservationStatusChangedEmailLib,
  sendReservationUpdatedEmail as sendReservationUpdatedEmailLib,
} from "@/shared/lib/email/reservation-emails";
import { sendReviewReplyEmail as sendReviewReplyEmailLib } from "@/shared/lib/email/review-emails";
import { sendWelcomeEmail as sendWelcomeEmailLib } from "@/shared/lib/email/welcome-emails";
import type {
  BulkReservationCancelledEmailData,
  ChangeEmailVerificationEmailData,
  DeleteAccountVerificationEmailData,
  EmailResult,
  EmailSendContext,
  EventAdminNotificationDelivery,
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventEmailRenderContext,
  EventUpdatedNotificationPayload,
  InquiryAdminNotificationDelivery,
  InquiryCustomerReplyAdminEmailData,
  InquiryReplyEmailData,
  InquiryStatusNotificationData,
  ReceiptIssuedEmailData,
  ReservationAdminNotificationDelivery,
  ReservationEmailData,
  ReservationEmailRenderContext,
  ReservationRefundEmailData,
  ReviewReplyEmailData,
  StatusChangeEmailData,
  WelcomeEmailData,
} from "@/shared/lib/email/types";
import {
  resolveEmailSendContext,
  resolveEventAdminNotificationDelivery,
  resolveInquiryCustomerReplyAdminDelivery,
  type EventAdminNotificationType,
} from "@/shared/domain/settings/queries/email-render-context";

async function requireSendContext(): Promise<EmailSendContext | null> {
  return resolveEmailSendContext();
}

function disabledEmailResult(): EmailResult {
  return { ok: false, reason: "disabled" };
}

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendWelcomeEmailLib(data, sendContext);
}

export async function sendChangeEmailVerificationEmail(
  data: ChangeEmailVerificationEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendChangeEmailVerificationEmailLib(data, sendContext);
}

export async function sendDeleteAccountVerificationEmail(
  data: DeleteAccountVerificationEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendDeleteAccountVerificationEmailLib(data, sendContext);
}

export async function sendReviewReplyEmail(
  data: ReviewReplyEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReviewReplyEmailLib(data, sendContext);
}

export async function sendReceiptIssuedEmail(
  input: ReceiptIssuedEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReceiptIssuedEmailLib(input, sendContext);
}

export async function sendReceiptResendEmail(
  input: Parameters<typeof sendReceiptResendEmailLib>[0],
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReceiptResendEmailLib(input, sendContext);
}

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendInquiryReplyEmailLib(data, sendContext);
}

export async function sendInquiryCustomerReplyAdminEmail(
  data: InquiryCustomerReplyAdminEmailData,
  delivery?: InquiryAdminNotificationDelivery & { enabled: boolean },
): Promise<EmailResult> {
  const [resolvedDelivery, sendContext] = await Promise.all([
    delivery ?? resolveInquiryCustomerReplyAdminDelivery(),
    requireSendContext(),
  ]);
  if (!sendContext || !resolvedDelivery.enabled) return disabledEmailResult();
  return sendInquiryCustomerReplyAdminEmailLib(
    data,
    resolvedDelivery,
    sendContext,
  );
}

export async function sendInquiryStatusNotificationToAll(
  inquiries: InquiryStatusNotificationData[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void> {
  const sendContext = await requireSendContext();
  if (!sendContext) return;
  return sendInquiryStatusNotificationToAllLib(
    inquiries,
    newStatus,
    sendContext,
  );
}

export async function sendEventRegistrationConfirmation(
  data: Parameters<typeof sendEventRegistrationConfirmationLib>[0],
  renderContext: EventEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventRegistrationConfirmationLib(data, renderContext, sendContext);
}

export async function sendEventRegistrationCancelled(
  data: Parameters<typeof sendEventRegistrationCancelledLib>[0],
  renderContext: EventEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventRegistrationCancelledLib(data, renderContext, sendContext);
}

export async function sendEventRegistrationUpdated(
  data: Parameters<typeof sendEventRegistrationUpdatedLib>[0],
  renderContext: EventEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventRegistrationUpdatedLib(data, renderContext, sendContext);
}

export async function sendEventAdminNotification(
  data: Parameters<typeof sendEventAdminNotificationLib>[0],
  type: EventAdminNotificationType,
  delivery?: EventAdminNotificationDelivery & { enabled: boolean },
): Promise<EmailResult> {
  const [resolvedDelivery, sendContext] = await Promise.all([
    delivery ?? resolveEventAdminNotificationDelivery(type),
    requireSendContext(),
  ]);
  if (!sendContext || !resolvedDelivery.enabled) return disabledEmailResult();
  return sendEventAdminNotificationLib(
    data,
    type,
    resolvedDelivery,
    sendContext,
  );
}

export async function sendEventCancelledToAllParticipants(
  payload: EventCancelledNotificationPayload,
  renderContext: EventEmailRenderContext,
  reason?: string,
): Promise<void> {
  const sendContext = await requireSendContext();
  if (!sendContext) return;
  return sendEventCancelledToAllParticipantsLib(
    payload,
    renderContext,
    sendContext,
    reason,
  );
}

export async function sendEventUpdatedToAllParticipants(
  payload: EventUpdatedNotificationPayload,
  oldSlotStartTimes: ReadonlyMap<string, Date>,
  renderContext: EventEmailRenderContext,
): Promise<void> {
  const sendContext = await requireSendContext();
  if (!sendContext) return;
  return sendEventUpdatedToAllParticipantsLib(
    payload,
    oldSlotStartTimes,
    renderContext,
    sendContext,
  );
}

export async function sendEventBroadcast(
  payload: EventBroadcastPayload,
  params: { subject: string; body: string; broadcastNonce: string },
): Promise<EventBroadcastResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return { ok: false, sent: 0, skipped: payload.skipped };
  return sendEventBroadcastLib(payload, params, sendContext);
}

export async function sendEventWaitlistRegistered(
  args: Parameters<typeof sendEventWaitlistRegisteredLib>[0],
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventWaitlistRegisteredLib(args, sendContext);
}

export async function sendEventWaitlistOffered(
  args: Parameters<typeof sendEventWaitlistOfferedLib>[0],
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventWaitlistOfferedLib(args, sendContext);
}

export async function sendEventWaitlistExpired(
  args: Parameters<typeof sendEventWaitlistExpiredLib>[0],
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendEventWaitlistExpiredLib(args, sendContext);
}

export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
  renderContext: ReservationEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationConfirmationEmailLib(data, renderContext, sendContext);
}

export async function sendReservationUpdatedEmail(
  data: ReservationEmailData,
  renderContext: ReservationEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationUpdatedEmailLib(data, renderContext, sendContext);
}

export async function sendReservationCancelledEmail(
  data: ReservationEmailData,
  renderContext: ReservationEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationCancelledEmailLib(data, renderContext, sendContext);
}

export async function sendReservationStatusChangedEmail(
  data: StatusChangeEmailData,
  renderContext: ReservationEmailRenderContext,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationStatusChangedEmailLib(data, renderContext, sendContext);
}

export async function sendReservationRefundEmail(
  data: ReservationRefundEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationRefundEmailLib(data, sendContext);
}

export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: "new" | "update" | "cancel",
  delivery: ReservationAdminNotificationDelivery,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendReservationAdminNotificationLib(
    data,
    action,
    delivery,
    sendContext,
  );
}

export async function sendBulkReservationCancelledEmail(
  data: BulkReservationCancelledEmailData,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendBulkReservationCancelledEmailLib(data, sendContext);
}

export async function sendBulkAdminNotification(
  data: BulkReservationCancelledEmailData,
  delivery: ReservationAdminNotificationDelivery,
): Promise<EmailResult> {
  const sendContext = await requireSendContext();
  if (!sendContext) return disabledEmailResult();
  return sendBulkAdminNotificationLib(data, delivery, sendContext);
}
