/**
 * イベント管理者通知メールの配信ゲート（notifyEventRegistration / notifyEventCancellation）テスト
 *
 * sendEventAdminNotification(data, type) は type -> toggle のマッピング
 * ({registration:notifyEventRegistration, cancellation:notifyEventCancellation}) と
 * 通知先アドレスの両方を満たすときだけ送信する（予約・問い合わせと同一モデル）。
 *
 * event-emails は prisma / organization を直接 import するため、import 時の prisma
 * 構築を避けてモジュールごとモックする。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type DeliverySettings = {
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyEventRegistration: boolean;
  notifyEventCancellation: boolean;
  replyToEmail: string | null;
};

const DELIVERY_DEFAULTS: DeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  notifyEventRegistration: true,
  notifyEventCancellation: true,
  replyToEmail: null,
};

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
const mockGetEmailDeliverySettings = mock<() => Promise<DeliverySettings>>(() =>
  Promise.resolve(DELIVERY_DEFAULTS),
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

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: () =>
    Promise.resolve({ name: "Org", email: "org@example.com" }),
}));
mock.module("@/shared/db/prisma", () => ({ prisma: {}, basePrisma: {} }));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendEventAdminNotification } from "@/shared/lib/email/event-emails";

const DATA = {
  registrationId: "registration-abcd12",
  participantName: "山田太郎",
  participantEmail: "participant@example.com",
  eventTitle: "ワークショップ",
  eventStartTime: new Date("2099-01-01T01:00:00Z"),
  quantity: 1,
  currentRegistrations: 5,
  capacity: 10,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
});

describe("sendEventAdminNotification() の type->toggle マッピング", () => {
  test("registration, notifyEventRegistration=false なら送信しない", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyEventRegistration: false,
    });

    const result = await sendEventAdminNotification(DATA, "registration");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("cancellation, notifyEventCancellation=false（他は true）なら送信しない（誤配線検出）", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyEventCancellation: false,
    });

    const result = await sendEventAdminNotification(DATA, "cancellation");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("registration, notifyEventRegistration=true かつ宛先ありなら送信する", async () => {
    await sendEventAdminNotification(DATA, "registration");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  test("通知先アドレスが空なら送信しない", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await sendEventAdminNotification(DATA, "registration");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
