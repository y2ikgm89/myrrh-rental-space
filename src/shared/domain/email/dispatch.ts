import "server-only";

import { sendCustomerBroadcast as sendCustomerBroadcastLib } from "@/shared/lib/email/customer-emails";
import {
  sendContactAdminNotification as sendContactAdminNotificationLib,
  sendContactConfirmationEmail as sendContactConfirmationEmailLib,
} from "@/shared/lib/email/contact-emails";
import { sendReservationReminderEmail as sendReservationReminderEmailLib } from "@/shared/lib/email/reminder-emails";
import {
  sendCalendarSyncRejectionEmail as sendCalendarSyncRejectionEmailLib,
  sendWebhookRenewalNotification as sendWebhookRenewalNotificationLib,
} from "@/shared/lib/email/system-emails";
import type {
  ContactEmailData,
  EmailResult,
  ReminderEmailData,
} from "@/shared/lib/email/types";
import { findCustomersForBroadcast } from "@/shared/domain/customers/queries";
import {
  getReminderEmailRenderContext,
  resolveContactAdminNotificationDelivery,
  resolveContactConfirmationRenderContext,
  resolveEmailSendContext,
  resolveSystemNotificationDelivery,
} from "@/shared/domain/settings/queries/email-render-context";

export async function sendContactConfirmationEmail(
  data: ContactEmailData,
): Promise<EmailResult> {
  const [renderContext, sendContext] = await Promise.all([
    resolveContactConfirmationRenderContext(),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) return { ok: false, reason: "disabled" };
  return sendContactConfirmationEmailLib(data, renderContext, sendContext);
}

export async function sendContactAdminNotification(
  data: ContactEmailData,
): Promise<EmailResult> {
  const [delivery, sendContext] = await Promise.all([
    resolveContactAdminNotificationDelivery(),
    resolveEmailSendContext(),
  ]);
  if (!sendContext || !delivery.enabled) {
    return { ok: false, reason: "disabled" };
  }
  return sendContactAdminNotificationLib(data, delivery, sendContext);
}

export async function sendCustomerBroadcast(
  customerIds: string[],
  params: { subject: string; body: string; broadcastNonce: string },
) {
  const [recipients, sendContext] = await Promise.all([
    findCustomersForBroadcast(customerIds),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) {
    return { ok: false as const, sent: 0, excluded: customerIds.length };
  }
  const excluded = customerIds.length - recipients.length;
  return sendCustomerBroadcastLib(recipients, excluded, params, sendContext);
}

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
): Promise<EmailResult> {
  const [renderContext, sendContext] = await Promise.all([
    getReminderEmailRenderContext(),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) return { ok: false, reason: "disabled" };
  return sendReservationReminderEmailLib(data, renderContext, sendContext);
}

export async function sendCalendarSyncRejectionEmail(
  data: Parameters<typeof sendCalendarSyncRejectionEmailLib>[0],
): Promise<EmailResult> {
  const [delivery, sendContext] = await Promise.all([
    resolveSystemNotificationDelivery(),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) return { ok: false, reason: "disabled" };
  return sendCalendarSyncRejectionEmailLib(data, delivery, sendContext);
}

export async function sendWebhookRenewalNotification(
  data: Parameters<typeof sendWebhookRenewalNotificationLib>[0],
): Promise<EmailResult> {
  const [delivery, sendContext] = await Promise.all([
    resolveSystemNotificationDelivery(),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) return { ok: false, reason: "disabled" };
  return sendWebhookRenewalNotificationLib(data, delivery, sendContext);
}
