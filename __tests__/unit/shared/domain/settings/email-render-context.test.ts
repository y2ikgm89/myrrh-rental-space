/**
 * Settings → lib 境界のメール render/delivery 解決（toggle × 宛先）テスト
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { EmailDeliverySettings } from "@/shared/domain/settings/queries/notification";

const DELIVERY_DEFAULTS: EmailDeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  notifyInquiryCustomerReply: true,
  notifyEventRegistration: true,
  notifyEventWaitlistRegistration: true,
  notifyEventCancellation: true,
  notifyEventReminder: true,
  senderEmail: null,
  senderName: null,
  replyToEmail: null,
};

const mockGetEmailDeliverySettings = mock<() => Promise<EmailDeliverySettings>>(
  () => Promise.resolve(DELIVERY_DEFAULTS),
);
const mockGetNotificationEmailAddresses = mock<() => Promise<string[]>>(() =>
  Promise.resolve(["admin@example.com"]),
);
const mockGetCalendarEmailSettings = mock<
  () => Promise<{
    icalAttachmentEnabled: boolean;
    addToCalendarLinksEnabled: boolean;
  }>
>(() =>
  Promise.resolve({
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  }),
);
const mockGetReservationDeadlineSettings = mock<
  () => Promise<{
    cancellationDeadlineHours: number;
    modificationDeadlineHours: number;
  }>
>(() =>
  Promise.resolve({
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 6,
  }),
);
const mockGetPublishedTermsByType = mock<
  () => Promise<{ slug: string } | null>
>(() => Promise.resolve({ slug: "cancellation-policy" }));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: () =>
    Promise.resolve({ name: "Org", email: "org@example.com" }),
}));
mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mockGetReservationDeadlineSettings,
}));
mock.module("@/shared/domain/terms/queries", () => ({
  getPublishedTermsByType: mockGetPublishedTermsByType,
}));
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedResendApiKey: () => Promise.resolve("re_test_key"),
}));
mock.module("@/shared/domain/customers/queries", () => ({
  getSuppressedEmailSet: () => Promise.resolve(new Set<string>()),
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(false),
}));
mock.module("@/shared/domain/settings/transfer-account-queries", () => ({
  listActiveTransferAccounts: () =>
    Promise.resolve([
      {
        id: "acct-1",
        label: "本店",
        bankName: "三井住友銀行",
        branchName: "渋谷支店",
        accountType: "ORDINARY",
        accountNumber: "1234567",
        accountHolderName: "カ）サンプル",
        note: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]),
  getTransferGuidance: () =>
    Promise.resolve("お振込の際は予約番号をご記入ください。"),
}));

import {
  getEventEmailRenderContext,
  getReservationEmailRenderContext,
  getReminderEmailRenderContext,
  isEmailEnabled,
  isEventAdminNotificationEnabled,
  isReservationAdminNotificationEnabled,
  isReservationConfirmationEmailEnabled,
  resolveContactAdminNotificationDelivery,
  resolveContactConfirmationRenderContext,
  resolveEmailSendContext,
  resolveEmailTransportContext,
  resolveEventAdminNotificationDelivery,
  resolveInquiryCustomerReplyAdminDelivery,
  resolveReservationAdminNotificationDelivery,
  resolveSystemNotificationDelivery,
} from "@/shared/domain/settings/queries/email-render-context";

beforeEach(() => {
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
  mockGetReservationDeadlineSettings.mockReset();
  mockGetReservationDeadlineSettings.mockResolvedValue({
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 6,
  });
  mockGetPublishedTermsByType.mockReset();
  mockGetPublishedTermsByType.mockResolvedValue({
    slug: "cancellation-policy",
  });
});

describe("getEventEmailRenderContext()", () => {
  test("calendar settings と organizer をまとめて返す", async () => {
    const context = await getEventEmailRenderContext();

    expect(context).toEqual({
      calendarSettings: {
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
      },
      organizer: { name: "Org", email: "org@example.com" },
      transferAccounts: [
        {
          bankName: "三井住友銀行",
          branchName: "渋谷支店",
          accountType: "ORDINARY",
          accountNumber: "1234567",
          accountHolderName: "カ）サンプル",
          note: null,
        },
      ],
      transferGuidance: "お振込の際は予約番号をご記入ください。",
      onlinePaymentAvailable: false,
    });
  });
});

describe("getReservationEmailRenderContext()", () => {
  test("calendar / organizer / deadline / cancellationPolicyUrl をまとめて返す", async () => {
    const context = await getReservationEmailRenderContext();

    expect(context).toEqual({
      calendarSettings: {
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
      },
      organizer: { name: "Org", email: "org@example.com" },
      deadlineSettings: {
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 6,
      },
      cancellationPolicyUrl: "https://example.com/terms/cancellation-policy",
      transferAccounts: [
        {
          bankName: "三井住友銀行",
          branchName: "渋谷支店",
          accountType: "ORDINARY",
          accountNumber: "1234567",
          accountHolderName: "カ）サンプル",
          note: null,
        },
      ],
      transferGuidance: "お振込の際は予約番号をご記入ください。",
      onlinePaymentAvailable: false,
    });
  });

  test("公開キャンセルポリシーが無ければ cancellationPolicyUrl は undefined", async () => {
    mockGetPublishedTermsByType.mockResolvedValue(null);

    const context = await getReservationEmailRenderContext();

    expect(context.cancellationPolicyUrl).toBeUndefined();
  });
});

describe("isReservationConfirmationEmailEnabled()", () => {
  test("sendReservationConfirmationEmail=false なら false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      sendReservationConfirmationEmail: false,
    });

    await expect(isReservationConfirmationEmailEnabled()).resolves.toBe(false);
  });

  test("sendReservationConfirmationEmail=true なら true", async () => {
    await expect(isReservationConfirmationEmailEnabled()).resolves.toBe(true);
  });
});

describe("isReservationAdminNotificationEnabled()", () => {
  test("action new, notifyNewReservation=false なら false", () => {
    expect(
      isReservationAdminNotificationEnabled("new", {
        ...DELIVERY_DEFAULTS,
        notifyNewReservation: false,
      }),
    ).toBe(false);
  });

  test("action cancel, notifyReservationCancel=false なら false（誤配線検出）", () => {
    expect(
      isReservationAdminNotificationEnabled("cancel", {
        ...DELIVERY_DEFAULTS,
        notifyReservationCancel: false,
      }),
    ).toBe(false);
  });

  test("action update, notifyReservationChange=true なら true", () => {
    expect(
      isReservationAdminNotificationEnabled("update", DELIVERY_DEFAULTS),
    ).toBe(true);
  });
});

describe("resolveReservationAdminNotificationDelivery()", () => {
  test("action new, notifyNewReservation=false なら enabled=false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyNewReservation: false,
    });

    const result = await resolveReservationAdminNotificationDelivery("new");

    expect(result.enabled).toBe(false);
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });

  test("toggle true かつ宛先ありなら enabled=true", async () => {
    const result = await resolveReservationAdminNotificationDelivery("update");

    expect(result.enabled).toBe(true);
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });

  test("通知先アドレスが空なら enabled=false", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await resolveReservationAdminNotificationDelivery("cancel");

    expect(result.enabled).toBe(false);
    expect(result.notificationEmails).toEqual([]);
  });
});

describe("isEventAdminNotificationEnabled()", () => {
  test("registration, notifyEventRegistration=false なら false", () => {
    expect(
      isEventAdminNotificationEnabled("registration", {
        ...DELIVERY_DEFAULTS,
        notifyEventRegistration: false,
      }),
    ).toBe(false);
  });

  test("cancellation, notifyEventCancellation=false なら false（誤配線検出）", () => {
    expect(
      isEventAdminNotificationEnabled("cancellation", {
        ...DELIVERY_DEFAULTS,
        notifyEventCancellation: false,
      }),
    ).toBe(false);
  });

  test("registration, notifyEventRegistration=true なら true", () => {
    expect(
      isEventAdminNotificationEnabled("registration", DELIVERY_DEFAULTS),
    ).toBe(true);
  });
});

describe("resolveEventAdminNotificationDelivery()", () => {
  test("registration, notifyEventRegistration=false なら enabled=false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyEventRegistration: false,
    });

    const result = await resolveEventAdminNotificationDelivery("registration");

    expect(result.enabled).toBe(false);
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });

  test("cancellation, notifyEventCancellation=false なら enabled=false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyEventCancellation: false,
    });

    const result = await resolveEventAdminNotificationDelivery("cancellation");

    expect(result.enabled).toBe(false);
  });

  test("toggle true かつ宛先ありなら enabled=true", async () => {
    const result = await resolveEventAdminNotificationDelivery("registration");

    expect(result.enabled).toBe(true);
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });

  test("通知先アドレスが空なら enabled=false", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await resolveEventAdminNotificationDelivery("registration");

    expect(result.enabled).toBe(false);
    expect(result.notificationEmails).toEqual([]);
  });
});

describe("resolveInquiryCustomerReplyAdminDelivery()", () => {
  test("notifyInquiryCustomerReply=false なら enabled=false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyInquiryCustomerReply: false,
    });

    const result = await resolveInquiryCustomerReplyAdminDelivery();

    expect(result.enabled).toBe(false);
  });

  test("通知先アドレスが空なら enabled=false", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await resolveInquiryCustomerReplyAdminDelivery();

    expect(result.enabled).toBe(false);
    expect(result.notificationEmails).toEqual([]);
  });

  test("toggle true かつ宛先ありなら enabled=true", async () => {
    const result = await resolveInquiryCustomerReplyAdminDelivery();

    expect(result.enabled).toBe(true);
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });
});

describe("resolveEmailTransportContext()", () => {
  test("resendApiKey を返す", async () => {
    const transport = await resolveEmailTransportContext();
    expect(transport.resendApiKey).toBeTruthy();
  });
});

describe("resolveEmailSendContext()", () => {
  test("transport / delivery / suppression をまとめて返す", async () => {
    const context = await resolveEmailSendContext();
    expect(context).not.toBeNull();
    expect(context?.transport.resendApiKey).toBeTruthy();
    expect(context?.delivery).toBeDefined();
    expect(context?.suppressedEmailHashes).toBeInstanceOf(Set);
  });
});

describe("resolveContactAdminNotificationDelivery()", () => {
  test("notifyNewInquiry=false なら enabled=false", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyNewInquiry: false,
    });
    const result = await resolveContactAdminNotificationDelivery();
    expect(result.enabled).toBe(false);
  });
});

describe("resolveSystemNotificationDelivery()", () => {
  test("通知先アドレスを返す", async () => {
    const result = await resolveSystemNotificationDelivery();
    expect(result.notificationEmails).toEqual(["admin@example.com"]);
  });
});

describe("getReminderEmailRenderContext()", () => {
  test("calendar / deadline / organizer を返す", async () => {
    const context = await getReminderEmailRenderContext();
    expect(context.calendarSettings).toBeDefined();
    expect(context.deadlineSettings.cancellationDeadlineHours).toBeTypeOf(
      "number",
    );
    expect(context.organizer.email).toBeTruthy();
  });
});

describe("resolveContactConfirmationRenderContext()", () => {
  test("privacyPolicyUrl は undefined でも返る", async () => {
    const context = await resolveContactConfirmationRenderContext();
    expect(context).toBeDefined();
  });
});

describe("isEmailEnabled()", () => {
  test("transport 解決結果に追随する", async () => {
    expect(await isEmailEnabled()).toBe(true);
  });
});
