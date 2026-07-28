/**
 * イベントメール Fixes 回帰テスト (RESEND-AUDIT H2 / M10)
 *
 * H2: sendEventReminderEmail() の idempotencyKey は registrationId 単体だと
 * claimUrl / cancelUrl の再暗号化で payload が毎回差分化するため、cron 再走時に
 * Resend が 409 (invalid_idempotent_request) で silent drop する。
 * → Date.now() を混ぜて invocation ごとに fresh key を発行する。
 *
 * M10: sendEventCancelledToAllParticipants() は CONFIRMED だけを対象にしていた
 * ため、WAITLISTED_OFFERED (24h の pay-now offer 保持中) 参加者や WAITLISTED
 * 参加者にイベント中止が届かなかった。
 * → status IN (CONFIRMED, WAITLISTED_OFFERED, WAITLISTED) を対象にする。
 * → CANCEL ICS は元々 REQUEST ICS を発行済みの CONFIRMED のみに添付する。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

type CapturedSendEmailParams = {
  idempotencyKey?: string;
  payload?: {
    to?: string;
    attachments?: { filename: string; content: Buffer }[];
  };
};

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
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

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { UNKNOWN: "UNKNOWN", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
  RENDER_CONTEXT_WITH_ICAL,
} from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendEventReminderEmail,
  sendEventCancelledToAllParticipants,
} from "@/shared/lib/email/event-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { EventFormat } from "@/shared/lib/validations/enums/prisma-types";

const REMINDER_DATA = {
  registrationId: "registration-abcd12",
  customerName: "山田太郎",
  customerEmail: "participant@example.com",
  eventTitle: "ワークショップ",
  eventStartTime: new Date("2099-01-01T01:00:00Z"),
  eventEndTime: new Date("2099-01-01T03:00:00Z"),
  location: undefined,
  quantity: 1,
  icsSequence: 0,
  customerId: null,
  format: EventFormat.OFFLINE,
  meetingUrl: null,
} satisfies Parameters<typeof sendEventReminderEmail>[0];

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

// ===========================================================================
// H2: sendEventReminderEmail() の idempotencyKey は cron 呼び出しごとに fresh
// ===========================================================================
describe("H2: sendEventReminderEmail() idempotencyKey drift 回避", () => {
  test("同一 registrationId の 2 回連続呼び出しで異なる idempotencyKey を発行する", async () => {
    await sendEventReminderEmail(
      { ...REMINDER_DATA },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    // 別 tick を挟むことで Date.now() の増分を保証する
    await new Promise((r) => setTimeout(r, 2));

    await sendEventReminderEmail(
      { ...REMINDER_DATA },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("キーは `event-reminder/<registrationId>/<timestamp>` 形式で始まる", async () => {
    await sendEventReminderEmail(
      { ...REMINDER_DATA },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const key = lastKey();
    expect(key).toBeDefined();
    expect(
      key?.startsWith(`event-reminder/${REMINDER_DATA.registrationId}/`),
    ).toBe(true);
    // 末尾は Date.now() の数値
    const suffix = key?.split("/").at(-1) ?? "";
    expect(Number.isFinite(Number(suffix))).toBe(true);
    expect(Number(suffix)).toBeGreaterThan(0);
  });
});

// ===========================================================================
// M10: sendEventCancelledToAllParticipants() は waitlist にも送る + ICS は
// CONFIRMED のみに添付
// ===========================================================================
describe("M10: sendEventCancelledToAllParticipants() の waitlist 網羅と ICS 出し分け", () => {
  test("CANCEL ICS 添付は CONFIRMED のみ。WAITLISTED / WAITLISTED_OFFERED には無添付", async () => {
    const payload = {
      eventId: "evt-1",
      title: "夏祭りワークショップ",
      format: EventFormat.OFFLINE,
      meetingUrl: null,
      updatedAt: new Date("2099-01-01T00:00:00Z"),
      venueDisplay: "本館ホール",
      registrations: [
        {
          id: "reg-confirmed",
          name: "確定 太郎",
          email: "confirmed@example.com",
          quantity: 1,
          icsSequence: 0,
          customerId: null,
          status: RegistrationStatus.CONFIRMED,
          slot: {
            startAt: new Date("2099-01-01T01:00:00Z"),
            endAt: new Date("2099-01-01T03:00:00Z"),
          },
        },
        {
          id: "reg-offered",
          name: "オファー中 花子",
          email: "offered@example.com",
          quantity: 1,
          icsSequence: 0,
          customerId: null,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          slot: {
            startAt: new Date("2099-01-01T01:00:00Z"),
            endAt: new Date("2099-01-01T03:00:00Z"),
          },
        },
        {
          id: "reg-waitlisted",
          name: "待機 次郎",
          email: "waitlisted@example.com",
          quantity: 1,
          icsSequence: 0,
          customerId: null,
          status: RegistrationStatus.WAITLISTED,
          slot: {
            startAt: new Date("2099-01-01T01:00:00Z"),
            endAt: new Date("2099-01-01T03:00:00Z"),
          },
        },
      ],
    };

    await sendEventCancelledToAllParticipants(
      payload,
      RENDER_CONTEXT_WITH_ICAL,
      EMAIL_SEND_CONTEXT,
      "講師都合のため中止",
    );

    const calls = mockSendEmail.mock.calls.map((c) => c[0]);
    expect(calls.length).toBe(3);

    const byRecipient = new Map<string, CapturedSendEmailParams>();
    for (const c of calls) {
      const to = c?.payload?.to;
      if (typeof to === "string") byRecipient.set(to, c);
    }

    const confirmedCall = byRecipient.get("confirmed@example.com");
    const offeredCall = byRecipient.get("offered@example.com");
    const waitlistedCall = byRecipient.get("waitlisted@example.com");

    expect(confirmedCall?.payload?.attachments?.length).toBe(1);
    expect(confirmedCall?.payload?.attachments?.[0]?.filename).toContain(
      "event-cancel-",
    );
    expect(offeredCall?.payload?.attachments).toBeUndefined();
    expect(waitlistedCall?.payload?.attachments).toBeUndefined();
  });
});
