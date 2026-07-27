import "server-only";

import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  InquiryAdminNotificationDelivery,
  ReservationAdminNotificationDelivery,
  ReservationEmailRenderContext,
} from "@/shared/lib/email/types";
import { getAppUrl } from "@/shared/lib/constants";
import { CANCELLATION_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
  type EmailDeliverySettings,
} from "@/shared/domain/settings/queries/notification";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";

export async function getEventEmailRenderContext(): Promise<EventEmailRenderContext> {
  const [calendarSettings, organizer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
  ]);
  return { calendarSettings, organizer };
}

export async function getReservationEmailRenderContext(): Promise<ReservationEmailRenderContext> {
  const [calendarSettings, organizer, deadlineSettings, cancellationDoc] =
    await Promise.all([
      getCalendarEmailSettings(),
      getIcalOrganizer(),
      getReservationDeadlineSettings(),
      getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE),
    ]);
  return {
    calendarSettings,
    organizer,
    deadlineSettings,
    cancellationPolicyUrl: cancellationDoc
      ? `${getAppUrl()}/terms/${cancellationDoc.slug}`
      : undefined,
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
