import "server-only";

import type {
  ContactAdminNotificationDelivery,
  ContactConfirmationRenderContext,
  EmailDeliveryContext,
  EmailSendContext,
  EmailTransportContext,
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  InquiryAdminNotificationDelivery,
  ReminderEmailRenderContext,
  ReservationAdminNotificationDelivery,
  ReservationEmailRenderContext,
  SystemNotificationDelivery,
  TransferAccountEmailDisplay,
} from "@/shared/lib/email/types";
import { getSuppressedEmailSet } from "@/shared/domain/customers/queries";
import { getDecryptedResendApiKey } from "@/shared/domain/settings/api-key-queries";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
  type EmailDeliverySettings,
} from "@/shared/domain/settings/queries/notification";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import { isOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import {
  getTransferGuidance,
  listActiveTransferAccounts,
} from "@/shared/domain/settings/transfer-account-queries";
import {
  isEmailTransportEnabled,
  resolveTransportApiKey,
} from "@/shared/lib/email/client";
import { sendEmail as sendEmailWithContext } from "@/shared/lib/email/send";
import type { SendEmailParams } from "@/shared/lib/email/send";
import type { EmailResult } from "@/shared/lib/email/types";
import {
  CANCELLATION_POLICY_TERMS_TYPE,
  PRIVACY_POLICY_TERMS_TYPE,
} from "@/shared/lib/validations/terms";
import { getAppUrl } from "@/shared/lib/constants";

function toEmailDeliveryContext(
  settings: EmailDeliverySettings,
): EmailDeliveryContext {
  return {
    senderEmail: settings.senderEmail,
    senderName: settings.senderName,
    replyToEmail: settings.replyToEmail,
  };
}

export async function resolveEmailTransportContext(): Promise<EmailTransportContext> {
  const dbApiKey = await getDecryptedResendApiKey();
  return { resendApiKey: resolveTransportApiKey(dbApiKey) };
}

/** Resend API キーが env / DB のいずれかに存在するか（cron 早期 return 用）。 */
export async function isEmailEnabled(): Promise<boolean> {
  const transport = await resolveEmailTransportContext();
  return isEmailTransportEnabled(transport);
}

export async function resolveEmailSendContext(): Promise<EmailSendContext | null> {
  const [transport, deliverySettings, suppressedEmailHashes] =
    await Promise.all([
      resolveEmailTransportContext(),
      getEmailDeliverySettings(),
      getSuppressedEmailSet(),
    ]);

  if (!isEmailTransportEnabled(transport)) {
    return null;
  }

  return {
    transport,
    delivery: toEmailDeliveryContext(deliverySettings),
    suppressedEmailHashes,
  };
}

/** domain 境界: Settings を解決して lib `sendEmail` を呼ぶ。 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const context = await resolveEmailSendContext();
  if (!context) return { ok: false, reason: "disabled" };
  return sendEmailWithContext(params, context);
}

async function resolveTransferEmailFields(): Promise<{
  onlinePaymentAvailable: boolean;
  transferAccounts: TransferAccountEmailDisplay[];
  transferGuidance: string | null;
}> {
  // feature が ON かではなく、**実際に Checkout が使えるか**で判断する。
  // credentials 欠損時に振込先まで消すと、メールに支払手段が 1 つも載らない（監査 F-133）。
  const onlinePaymentAvailable = await isOnlinePaymentAvailable();
  if (onlinePaymentAvailable) {
    return {
      onlinePaymentAvailable,
      transferAccounts: [],
      transferGuidance: null,
    };
  }

  const [accounts, transferGuidance] = await Promise.all([
    listActiveTransferAccounts(),
    getTransferGuidance(),
  ]);

  return {
    onlinePaymentAvailable,
    transferAccounts: accounts.map((account) => ({
      bankName: account.bankName,
      branchName: account.branchName,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      accountHolderName: account.accountHolderName,
      note: account.note,
    })),
    transferGuidance,
  };
}

export async function getEventEmailRenderContext(): Promise<EventEmailRenderContext> {
  const [calendarSettings, organizer, transferFields] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    resolveTransferEmailFields(),
  ]);
  return {
    calendarSettings,
    organizer,
    transferAccounts: transferFields.transferAccounts,
    transferGuidance: transferFields.transferGuidance,
    onlinePaymentAvailable: transferFields.onlinePaymentAvailable,
  };
}

export async function getReservationEmailRenderContext(): Promise<ReservationEmailRenderContext> {
  const [
    calendarSettings,
    organizer,
    deadlineSettings,
    cancellationDoc,
    transferFields,
  ] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getReservationDeadlineSettings(),
    getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE),
    resolveTransferEmailFields(),
  ]);
  return {
    calendarSettings,
    organizer,
    deadlineSettings,
    cancellationPolicyUrl: cancellationDoc
      ? `${getAppUrl()}/terms/${cancellationDoc.slug}`
      : undefined,
    transferAccounts: transferFields.transferAccounts,
    transferGuidance: transferFields.transferGuidance,
    onlinePaymentAvailable: transferFields.onlinePaymentAvailable,
  };
}

export async function isReservationConfirmationEmailEnabled(): Promise<boolean> {
  const toggles = await getEmailDeliverySettings();
  return toggles.sendReservationConfirmationEmail;
}

export type EventAdminNotificationType =
  "registration" | "waitlist_registration" | "cancellation";

export function isEventAdminNotificationEnabled(
  type: EventAdminNotificationType,
  toggles: EmailDeliverySettings,
): boolean {
  const enabledByType: Record<EventAdminNotificationType, boolean> = {
    registration: toggles.notifyEventRegistration,
    waitlist_registration: toggles.notifyEventWaitlistRegistration,
    cancellation: toggles.notifyEventCancellation,
  };
  return enabledByType[type];
}

export async function resolveEventAdminNotificationDelivery(
  type: EventAdminNotificationType,
): Promise<EventAdminNotificationDelivery & { enabled: boolean }> {
  const [toggles, notificationEmails] = await Promise.all([
    getEmailDeliverySettings(),
    getNotificationEmailAddresses(),
  ]);
  return {
    enabled:
      isEventAdminNotificationEnabled(type, toggles) &&
      notificationEmails.length > 0,
    notificationEmails,
  };
}

export type ReservationAdminNotificationType = "new" | "update" | "cancel";

export function isReservationAdminNotificationEnabled(
  action: ReservationAdminNotificationType,
  toggles: EmailDeliverySettings,
): boolean {
  const enabledByAction: Record<ReservationAdminNotificationType, boolean> = {
    new: toggles.notifyNewReservation,
    update: toggles.notifyReservationChange,
    cancel: toggles.notifyReservationCancel,
  };
  return enabledByAction[action];
}

export async function resolveReservationAdminNotificationDelivery(
  action: ReservationAdminNotificationType,
): Promise<ReservationAdminNotificationDelivery & { enabled: boolean }> {
  const [toggles, notificationEmails] = await Promise.all([
    getEmailDeliverySettings(),
    getNotificationEmailAddresses(),
  ]);
  return {
    enabled:
      isReservationAdminNotificationEnabled(action, toggles) &&
      notificationEmails.length > 0,
    notificationEmails,
  };
}

export async function resolveInquiryCustomerReplyAdminDelivery(): Promise<
  InquiryAdminNotificationDelivery & { enabled: boolean }
> {
  const [toggles, notificationEmails] = await Promise.all([
    getEmailDeliverySettings(),
    getNotificationEmailAddresses(),
  ]);
  return {
    enabled:
      toggles.notifyInquiryCustomerReply && notificationEmails.length > 0,
    notificationEmails,
  };
}

export async function resolveContactAdminNotificationDelivery(): Promise<
  ContactAdminNotificationDelivery & { enabled: boolean }
> {
  const [toggles, notificationEmails] = await Promise.all([
    getEmailDeliverySettings(),
    getNotificationEmailAddresses(),
  ]);
  return {
    enabled: toggles.notifyNewInquiry && notificationEmails.length > 0,
    notificationEmails,
  };
}

export async function resolveContactConfirmationRenderContext(): Promise<ContactConfirmationRenderContext> {
  const doc = await getPublishedTermsByType(PRIVACY_POLICY_TERMS_TYPE);
  return doc ? { privacyPolicyUrl: `${getAppUrl()}/terms/${doc.slug}` } : {};
}

export async function getReminderEmailRenderContext(): Promise<ReminderEmailRenderContext> {
  const [calendarSettings, deadlineSettings, organizer] = await Promise.all([
    getCalendarEmailSettings(),
    getReservationDeadlineSettings(),
    getIcalOrganizer(),
  ]);
  return {
    calendarSettings,
    deadlineSettings: {
      cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
    },
    organizer,
  };
}

export async function resolveSystemNotificationDelivery(): Promise<SystemNotificationDelivery> {
  const notificationEmails = await getNotificationEmailAddresses();
  return { notificationEmails };
}
