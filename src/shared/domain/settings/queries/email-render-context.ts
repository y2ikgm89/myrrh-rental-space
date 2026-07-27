import "server-only";

import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  InquiryAdminNotificationDelivery,
} from "@/shared/lib/email/types";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
  type EmailDeliverySettings,
} from "@/shared/domain/settings/queries/notification";

export async function getEventEmailRenderContext(): Promise<EventEmailRenderContext> {
  const [calendarSettings, organizer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
  ]);
  return { calendarSettings, organizer };
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
