import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowlistedNotificationStaffIds } from "@/shared/domain/settings/notification-staff";
import type { BusinessHours } from "@/shared/lib/json-validators";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  casUpdateOrCreateSingleton,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";

export type BusinessInfoInput = {
  businessName: string | null;
  businessNameKana: string | null;
  representativeName: string | null;
  establishedDate: string | null;
  registrationNumber: string | null;
  invoiceNumber: string | null;
  businessDescription: string | null;
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type ContactInfoInput = {
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  // 交通案内・駐車場案内は Location 単位で管理（Settings からは廃止済）
};

export type BusinessHoursSettingsInput = {
  businessHours: BusinessHours;
  holidayNotice: string | null;
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type EmailSettingsInput = {
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  sendReservationConfirmationEmail: boolean;
  notifyEventReminder: boolean;
  notificationStaffIds: string[];
  notificationEmailAddresses: string[];
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedOrganizationUpdatedAt: string | Date;
  /** 楽観的 concurrency: 読み込み時の SettingsReservation.updatedAt */
  expectedReservationUpdatedAt: string | Date;
  /** 楽観的 concurrency: 読み込み時の SettingsNotification.updatedAt */
  expectedNotificationUpdatedAt: string | Date;
};

export type NotificationSettingsInput = {
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyInquiryCustomerReply: boolean;
  notifyEventRegistration: boolean;
  notifyEventWaitlistRegistration: boolean;
  notifyEventCancellation: boolean;
  /** 楽観的 concurrency: 読み込み時の SettingsNotification.updatedAt */
  expectedUpdatedAt: string | Date;
};

function normalizeNullableString(value: string | null): string | null {
  return value || null;
}

export async function updateBusinessInfo(
  data: BusinessInfoInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    businessName: data.businessName,
    businessNameKana: data.businessNameKana,
    representativeName: data.representativeName,
    establishedDate: data.establishedDate
      ? new Date(data.establishedDate)
      : null,
    registrationNumber: data.registrationNumber,
    invoiceNumber: data.invoiceNumber,
    businessDescription: data.businessDescription,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsOrganization.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateContactInfo(data: ContactInfoInput): Promise<void> {
  const updateData = {
    ...data,
    email: normalizeNullableString(data.email),
  };

  await prisma.settingsOrganization.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    businessHours: data.businessHours,
    holidayNotice: data.holidayNotice,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsOrganization.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateEmailSettings(
  data: EmailSettingsInput,
): Promise<void> {
  const notificationStaffIds = await assertAllowlistedNotificationStaffIds(
    data.notificationStaffIds,
  );
  const expectedOrganizationUpdatedAt = toExpectedUpdatedAt(
    data.expectedOrganizationUpdatedAt,
  );
  const expectedReservationUpdatedAt = toExpectedUpdatedAt(
    data.expectedReservationUpdatedAt,
  );
  const expectedNotificationUpdatedAt = toExpectedUpdatedAt(
    data.expectedNotificationUpdatedAt,
  );

  const organizationData = {
    senderEmail: normalizeNullableString(data.senderEmail),
    senderName: normalizeNullableString(data.senderName),
    replyToEmail: normalizeNullableString(data.replyToEmail),
  };
  const reservationData = {
    sendReservationConfirmationEmail: data.sendReservationConfirmationEmail,
  };
  const notificationData = {
    notifyEventReminder: data.notifyEventReminder,
    notificationStaffIds,
    notificationEmailAddresses: data.notificationEmailAddresses,
  };

  await prisma.$transaction(async (tx) => {
    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsOrganization.updateMany(args),
      findUnique: (args) => tx.settingsOrganization.findUnique(args),
      create: (args) => tx.settingsOrganization.create(args),
      expectedUpdatedAt: expectedOrganizationUpdatedAt,
      updateData: organizationData,
      createData: { id: "singleton", ...organizationData },
    });

    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsReservation.updateMany(args),
      findUnique: (args) => tx.settingsReservation.findUnique(args),
      create: (args) => tx.settingsReservation.create(args),
      expectedUpdatedAt: expectedReservationUpdatedAt,
      updateData: reservationData,
      createData: { id: "singleton", ...reservationData },
    });

    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsNotification.updateMany(args),
      findUnique: (args) => tx.settingsNotification.findUnique(args),
      create: (args) => tx.settingsNotification.create(args),
      expectedUpdatedAt: expectedNotificationUpdatedAt,
      updateData: notificationData,
      createData: { id: "singleton", ...notificationData },
    });
  });
}

export async function updateNotificationSettings(
  data: NotificationSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    notifyNewReservation: data.notifyNewReservation,
    notifyReservationChange: data.notifyReservationChange,
    notifyReservationCancel: data.notifyReservationCancel,
    notifyNewInquiry: data.notifyNewInquiry,
    notifyInquiryCustomerReply: data.notifyInquiryCustomerReply,
    notifyEventRegistration: data.notifyEventRegistration,
    notifyEventWaitlistRegistration: data.notifyEventWaitlistRegistration,
    notifyEventCancellation: data.notifyEventCancellation,
  };

  await prisma.$transaction(async (tx) => {
    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsNotification.updateMany(args),
      findUnique: (args) => tx.settingsNotification.findUnique(args),
      create: (args) => tx.settingsNotification.create(args),
      expectedUpdatedAt,
      updateData,
      createData: { id: "singleton", ...updateData },
    });
  });
}
