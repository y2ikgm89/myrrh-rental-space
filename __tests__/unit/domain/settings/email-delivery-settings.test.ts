import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../mocks/errors-server";

const mockSettingsNotificationFindUnique = mock<
  () => Promise<Record<string, boolean> | null>
>(() => Promise.resolve(null));

const mockSettingsOrganizationFindUnique = mock<
  () => Promise<{
    senderEmail: string | null;
    senderName: string | null;
    replyToEmail: string | null;
  } | null>
>(() => Promise.resolve(null));

const mockSettingsReservationFindUnique = mock<
  () => Promise<{ sendReservationConfirmationEmail: boolean } | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsNotification: {
      findUnique: mockSettingsNotificationFindUnique,
    },
    settingsOrganization: {
      findUnique: mockSettingsOrganizationFindUnique,
    },
    settingsReservation: {
      findUnique: mockSettingsReservationFindUnique,
    },
  },
}));

await installErrorsServerMock({
  safeFetch: async <T>({
    fetch,
    fallback,
  }: {
    fetch: () => Promise<T>;
    fallback: T;
  }) => {
    try {
      return await fetch();
    } catch {
      return fallback;
    }
  },
});

const { getEmailDeliverySettings } =
  await import("@/shared/domain/settings/queries/notification");

describe("getEmailDeliverySettings", () => {
  beforeEach(() => {
    mockSettingsNotificationFindUnique.mockClear();
    mockSettingsOrganizationFindUnique.mockClear();
    mockSettingsReservationFindUnique.mockClear();
    mockSettingsNotificationFindUnique.mockResolvedValue(null);
    mockSettingsOrganizationFindUnique.mockResolvedValue(null);
    mockSettingsReservationFindUnique.mockResolvedValue(null);
  });

  test("SettingsNotification 欠落時は notify* をすべて false（fail-closed）", async () => {
    const settings = await getEmailDeliverySettings();

    expect(settings.notifyNewReservation).toBe(false);
    expect(settings.notifyReservationChange).toBe(false);
    expect(settings.notifyReservationCancel).toBe(false);
    expect(settings.notifyNewInquiry).toBe(false);
    expect(settings.notifyInquiryCustomerReply).toBe(false);
    expect(settings.notifyEventRegistration).toBe(false);
    expect(settings.notifyEventWaitlistRegistration).toBe(false);
    expect(settings.notifyEventCancellation).toBe(false);
    expect(settings.notifyEventReminder).toBe(false);
  });

  test("SettingsReservation 欠落時も sendReservationConfirmationEmail は true", async () => {
    const settings = await getEmailDeliverySettings();
    expect(settings.sendReservationConfirmationEmail).toBe(true);
  });
});
