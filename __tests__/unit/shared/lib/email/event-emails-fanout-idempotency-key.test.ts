/**
 * イベント一斉通知（中止・内容変更）の `idempotencyKey` は**申込ごとに割れる**（監査 A-22）。
 *
 * ## なぜ
 *
 * 中止・内容変更の fan-out は申込単位で送るが、本文は申込ごとに違う
 * （開催日時・`eventRegistrationHubUrl`・添付する ICS がそれぞれ申込 id 由来）。
 * 以前は鍵が `hashForKey(registration.email)` 由来だったため、**同じメールアドレスで
 * 複数枠を申し込んだ参加者**の 2 通目が Resend の `invalid_idempotent_request`(409) で
 * 落ちていた。`send.ts` の `RETRYABLE_ERROR_NAMES` に 409 は含まれないので再試行もされず、
 * 参加者は片方の枠の通知しか受け取らない（CANCEL ICS も届かず、カレンダーに予定が残る）。
 *
 * `EventRegistration` に `(eventId, email)` の `@@unique` は無く、申込コマンドにも
 * 既存申込チェックは無いので、この状況は正規の運用で起こる。
 *
 * ## 何を見るか
 *
 * 同一メール・別申込を 2 件与えて、実際に `sendEmail` へ渡った `idempotencyKey` が
 * 相異なること。**静的な grep ではなく実際に流す** — 補間の数を数えるだけの検査は
 * 「補間はあるが全申込で同じ値」を通してしまう（旧 `reservation-email-idempotency`
 * gate の限界として、その gate 自身の JSDoc が明言している）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const mockSendEmail = mock<
  (args: { idempotencyKey?: string }) => Promise<{
    ok: true;
    messageId: string;
  }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
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
mock.module("@/shared/emails/event-cancelled-notification", () => ({
  EventCancelledNotificationEmail: mock(() => null),
}));
mock.module("@/shared/emails/event-updated-notification", () => ({
  EventUpdatedNotificationEmail: mock(() => null),
}));

import { EMAIL_SEND_CONTEXT, RENDER_CONTEXT } from "./_email-test-fixtures";

import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";

/** 同一メールアドレスで 2 枠に申し込んだ 1 人（TIMED_ENTRY で普通に起きる）。 */
const SAME_EMAIL = "double@example.com";
const REGISTRATIONS = [
  {
    id: "reg-morning",
    name: "二重 申込",
    email: SAME_EMAIL,
    quantity: 1,
    icsSequence: 0,
    customerId: "customer-1",
    slotId: "slot-morning",
    slot: {
      startAt: new Date("2099-01-01T01:00:00Z"),
      endAt: new Date("2099-01-01T03:00:00Z"),
    },
  },
  {
    id: "reg-afternoon",
    name: "二重 申込",
    email: SAME_EMAIL,
    quantity: 1,
    icsSequence: 0,
    customerId: "customer-1",
    slotId: "slot-afternoon",
    slot: {
      startAt: new Date("2099-01-01T05:00:00Z"),
      endAt: new Date("2099-01-01T07:00:00Z"),
    },
  },
];

const BASE_PAYLOAD = {
  eventId: "evt-1",
  title: "夏祭りワークショップ",
  format: "OFFLINE" as const,
  meetingUrl: null,
  updatedAt: new Date("2099-01-01T00:00:00Z"),
  venueDisplay: "本館ホール",
};

function sentKeys(): string[] {
  return mockSendEmail.mock.calls.map((c) => c[0]?.idempotencyKey ?? "");
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("イベント一斉通知の idempotencyKey は申込ごとに割れる", () => {
  test("中止通知: 同一メールの 2 申込に別々の鍵を使う", async () => {
    await sendEventCancelledToAllParticipants(
      {
        ...BASE_PAYLOAD,
        registrations: REGISTRATIONS.map((r) => ({
          ...r,
          status: RegistrationStatus.CONFIRMED,
        })),
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
      "講師都合のため中止",
    );

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  test("内容変更通知: 同一メール・同一枠の 2 申込でも別々の鍵を使う", async () => {
    // slotId が同じ = 旧実装の discriminator が効かない最悪ケース。
    const sameSlot = REGISTRATIONS.map((r) => ({
      ...r,
      slotId: "slot-morning",
      slot: REGISTRATIONS[0]?.slot ?? r.slot,
    }));

    await sendEventUpdatedToAllParticipants(
      { ...BASE_PAYLOAD, registrations: sameSlot },
      new Map([["slot-morning", new Date("2098-12-25T01:00:00Z")]]),
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
