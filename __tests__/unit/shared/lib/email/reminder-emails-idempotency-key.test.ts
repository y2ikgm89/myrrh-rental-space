/**
 * 予約リマインダーメール idempotencyKey — cron バッチ単位で deterministic。
 *
 * 同一 reminderWindowDate（JST 日付）内の再送は Resend 冪等で抑止し、
 * 別日の cron 実行では新キーで再送可能。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type CapturedSendEmailParams = { idempotencyKey?: string };

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

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
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
  getEmailDeliverySettings: () =>
    Promise.resolve({
      sendReservationConfirmationEmail: true,
      notifyNewReservation: true,
      notifyReservationChange: true,
      notifyReservationCancel: true,
      notifyNewInquiry: true,
      notifyEventRegistration: true,
      notifyEventCancellation: true,
      replyToEmail: null,
    }),
  getNotificationEmailAddresses: () => Promise.resolve(["admin@example.com"]),
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
mock.module("@/shared/db/prisma", () => ({ prisma: {} }));
mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () =>
    Promise.resolve({
      businessName: "Org",
      address: "",
      phoneNumber: null,
      contactEmail: null,
      siteName: "Org",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

import {
  EMAIL_SEND_CONTEXT,
  REMINDER_RENDER_CONTEXT,
} from "./_email-test-fixtures";

import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";

import type { ReminderEmailData } from "@/shared/lib/email/types";

const REMINDER_WINDOW = "2099-01-02";

const REMINDER_BASE: ReminderEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  location: undefined,
  notes: undefined,
  icsSequence: 0,
  userId: null,
  reminderWindowDate: REMINDER_WINDOW,
};

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendReservationReminderEmail() idempotencyKey", () => {
  test("同一 reminderWindowDate では同じキー（Resend 冪等）", async () => {
    await sendReservationReminderEmail(
      { ...REMINDER_BASE },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendReservationReminderEmail(
      { ...REMINDER_BASE },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBe(
      `reservation-reminder/${REMINDER_BASE.reservationId}/${REMINDER_WINDOW}`,
    );
    expect(secondKey).toBe(firstKey);
  });

  test("reminderWindowDate が異なれば別キー", async () => {
    await sendReservationReminderEmail(
      { ...REMINDER_BASE, reminderWindowDate: "2099-01-02" },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendReservationReminderEmail(
      { ...REMINDER_BASE, reminderWindowDate: "2099-01-03" },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).not.toBe(secondKey);
  });
});
