/**
 * 予約メールの配信ゲート（sendReservationConfirmationEmail / notify* per action）テスト
 *
 * - sendReservationConfirmationEmail() は settings.sendReservationConfirmationEmail が
 *   false なら送信しない（status-changed / cancelled は別関数で常時送信）。
 * - sendReservationAdminNotification(data, action) は action -> toggle のマッピング
 *   ({new:notifyNewReservation, update:notifyReservationChange, cancel:notifyReservationCancel})
 *   と通知先アドレスの両方を満たすときだけ送信する。
 *
 * 重い依存（ical / organizer / deadline）は no-op パスでは到達しないが、import 時の
 * prisma 読み込みを避けるため settings query モジュールごとモックする。
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
const mockGetIcalOrganizer = mock<
  () => Promise<{ name: string; email: string }>
>(() => Promise.resolve({ name: "Org", email: "org@example.com" }));
const mockGetReservationDeadlineSettings = mock<
  () => Promise<{
    cancellationDeadlineHours: number;
    modificationDeadlineHours: number;
  }>
>(() =>
  Promise.resolve({
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,
  }),
);

mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: mockGetIcalOrganizer,
}));
mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mockGetReservationDeadlineSettings,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendReservationConfirmationEmail,
  sendReservationAdminNotification,
} from "@/shared/lib/email/reservation-emails";
import type { ReservationEmailData } from "@/shared/lib/email/types";

const DATA: ReservationEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPrice: 5000,
  icsSequence: 0,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
});

describe("sendReservationConfirmationEmail() のゲート", () => {
  test("sendReservationConfirmationEmail=false なら送信しない", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      sendReservationConfirmationEmail: false,
    });

    const result = await sendReservationConfirmationEmail(DATA);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sendReservationAdminNotification() の action->toggle マッピング", () => {
  test("action new, notifyNewReservation=false なら送信しない", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyNewReservation: false,
    });

    const result = await sendReservationAdminNotification(DATA, "new");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("action cancel, notifyReservationCancel=false（他は true）なら送信しない（誤配線検出）", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyReservationCancel: false,
    });

    const result = await sendReservationAdminNotification(DATA, "cancel");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("action update, notifyReservationChange=true かつ宛先ありなら送信する", async () => {
    await sendReservationAdminNotification(DATA, "update");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  test("通知先アドレスが空なら送信しない", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await sendReservationAdminNotification(DATA, "new");

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
