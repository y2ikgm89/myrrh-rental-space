/**
 * 予約リマインダーメール (`sendReservationReminderEmail`) の idempotencyKey drift gate。
 *
 * Resend の idempotency key は 24h 有効で、同一キーでの再送に payload 差分がある場合は
 * 409 `invalid_idempotent_request` を返す。この 409 は `RETRYABLE_ERROR_NAMES`
 * (`send.ts`) に含まれないため silent drop に近い挙動になり、顧客にリマインダーが
 * 届かない事故を引き起こす。
 *
 * リマインダーの payload には呼び出し毎に**新規に暗号化された** cancelUrl / claimUrl が
 * 埋め込まれる（`crypto.ts` の AES-GCM は都度異なる IV を使うため同じ入力でも暗号文が
 * 変わる）。よって cron が transient 失敗で `reminderSentAt` claim を release し同予約を
 * 再 pick したとき、静的キー (`reservation-reminder/<id>`) だと必ず payload drift で 409 になる。
 *
 * この gate は「呼び出しごとに fresh な idempotencyKey が発行される」ことを強制する
 * (`event-waitlist-emails.test.ts:302` の `expiresAt.getTime()` パターンと対称)。
 * 実際の重複送信抑止は `reminderSentAt` WHERE 節（claim 済みは pick しない）が担う。
 *
 * Fixes RESEND-AUDIT M9.
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
mock.module("@/shared/db/prisma", () => ({ prisma: {}, basePrisma: {} }));
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

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import type { ReminderEmailData } from "@/shared/lib/email/types";

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
};

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendReservationReminderEmail() の idempotencyKey は呼び出し毎に fresh になる", () => {
  test("同一 data を連続で 2 回送っても異なるキー（cron re-pick で 409 silent drop を回避）", async () => {
    await sendReservationReminderEmail({ ...REMINDER_BASE });
    const firstKey = lastKey();

    // Date.now() の bucket が確実に切り替わるよう少し待つ
    // （bun test 環境の setTimeout は fake ではないので実時間で待つ）
    await new Promise((resolve) => setTimeout(resolve, 2));

    await sendReservationReminderEmail({ ...REMINDER_BASE });
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("キーは `reservation-reminder/<reservationId>/<timestamp>` 形式で timestamp は数字", async () => {
    await sendReservationReminderEmail({ ...REMINDER_BASE });
    const key = lastKey();

    expect(key).toBeDefined();
    expect(
      key?.startsWith(`reservation-reminder/${REMINDER_BASE.reservationId}/`),
    ).toBe(true);

    const suffix = key?.slice(
      `reservation-reminder/${REMINDER_BASE.reservationId}/`.length,
    );
    expect(suffix).toMatch(/^\d+$/);
  });
});
