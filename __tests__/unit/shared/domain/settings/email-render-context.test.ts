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
  getReservationDeadlineSettings: () =>
    Promise.resolve({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 24,
    }),
}));
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedResendApiKey: () => Promise.resolve("re_test_key"),
}));
mock.module("@/shared/domain/terms/queries", () => ({
  getPublishedTermsByType: () => Promise.resolve(null),
}));
mock.module("@/shared/domain/customers/queries", () => ({
  getSuppressedEmailSet: () => Promise.resolve(new Set<string>()),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  getEventEmailRenderContext,
  getReminderEmailRenderContext,
  isEmailEnabled,
  isEventAdminNotificationEnabled,
  resolveContactAdminNotificationDelivery,
  resolveContactConfirmationRenderContext,
  resolveEmailSendContext,
  resolveEmailTransportContext,
  resolveEventAdminNotificationDelivery,
  resolveInquiryCustomerReplyAdminDelivery,
  resolveSystemNotificationDelivery,
} from "@/shared/domain/settings/queries/email-render-context";

beforeEach(() => {
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
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
    });
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
