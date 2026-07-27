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

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  getEventEmailRenderContext,
  isEventAdminNotificationEnabled,
  resolveEventAdminNotificationDelivery,
  resolveInquiryCustomerReplyAdminDelivery,
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
