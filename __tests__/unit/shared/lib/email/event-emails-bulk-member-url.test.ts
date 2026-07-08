/**
 * イベント一括通知メール（中止・内容変更）の memberEventRegistrationUrl 出し分けテスト
 *
 * sendEventCancelledToAllParticipants() / sendEventUpdatedToAllParticipants() は
 * イベント単位で全参加者（会員・ゲスト混在）をループして送信する。会員申込
 * （customerId あり）だけ「マイページで申込を確認する」memberEventRegistrationUrl
 * を本文に含める。この customerId は元々 Prisma select に含まれておらず、会員に
 * も一律リンクが欠落していた回帰 — select 漏れは型チェック・lint では検出できない。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

type EventRow = {
  title: string;
  updatedAt: Date;
  addressDetail: string | null;
  location: { name: string } | null;
  space: { name: string } | null;
  registrations: {
    id: string;
    name: string;
    email: string | null;
    quantity: number;
    icsSequence: number;
    customerId: string | null;
    slotId?: string;
    slot: { startAt: Date; endAt: Date };
  }[];
};

const MEMBER_REGISTRATION = {
  id: "reg-member",
  name: "会員 太郎",
  email: "member@example.com",
  quantity: 1,
  icsSequence: 0,
  customerId: "customer-1",
  slotId: "slot-1",
  slot: {
    startAt: new Date("2099-01-01T01:00:00Z"),
    endAt: new Date("2099-01-01T03:00:00Z"),
  },
};

const GUEST_REGISTRATION = {
  id: "reg-guest",
  name: "ゲスト 花子",
  email: "guest@example.com",
  quantity: 1,
  icsSequence: 0,
  customerId: null,
  slotId: "slot-1",
  slot: {
    startAt: new Date("2099-01-01T01:00:00Z"),
    endAt: new Date("2099-01-01T03:00:00Z"),
  },
};

function makeEventRow(): EventRow {
  return {
    title: "夏祭りワークショップ",
    updatedAt: new Date("2099-01-01T00:00:00Z"),
    addressDetail: null,
    location: null,
    space: { name: "本館ホール" },
    registrations: [{ ...MEMBER_REGISTRATION }, { ...GUEST_REGISTRATION }],
  };
}

const mockFindFirst = mock<() => Promise<EventRow | null>>(() =>
  Promise.resolve(makeEventRow()),
);
mock.module("@/shared/db/prisma", () => ({
  prisma: { event: { findFirst: mockFindFirst } },
  basePrisma: {},
}));

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getCalendarEmailSettings: mock(() =>
    Promise.resolve({
      icalAttachmentEnabled: false,
      addToCalendarLinksEnabled: false,
    }),
  ),
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: mock(() =>
    Promise.resolve({ name: "Org", email: "org@example.com" }),
  ),
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

type MemberUrlProps = { memberEventRegistrationUrl?: string };
const mockEventCancelledNotificationEmail = mock(
  (props: MemberUrlProps) => props,
);
const mockEventUpdatedNotificationEmail = mock(
  (props: MemberUrlProps) => props,
);
mock.module("@/shared/emails/event-cancelled-notification", () => ({
  EventCancelledNotificationEmail: mockEventCancelledNotificationEmail,
}));
mock.module("@/shared/emails/event-updated-notification", () => ({
  EventUpdatedNotificationEmail: mockEventUpdatedNotificationEmail,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";

const MEMBER_URL_PATTERN = /\/mypage\/events$/;

beforeEach(() => {
  mockFindFirst.mockReset();
  mockFindFirst.mockImplementation(() => Promise.resolve(makeEventRow()));
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockEventCancelledNotificationEmail.mockClear();
  mockEventUpdatedNotificationEmail.mockClear();
});

describe("sendEventCancelledToAllParticipants() の memberEventRegistrationUrl 出し分け", () => {
  test("会員申込には memberEventRegistrationUrl を含め、ゲスト申込には含めない", async () => {
    await sendEventCancelledToAllParticipants("evt-1", "講師都合のため中止");

    const calls = mockEventCancelledNotificationEmail.mock.calls;
    const memberProps = calls.find((c) =>
      c[0]?.memberEventRegistrationUrl?.includes("/mypage/events"),
    )?.[0];
    const guestProps = calls
      .map((c) => c[0])
      .find((p) => p?.memberEventRegistrationUrl === undefined);

    expect(memberProps?.memberEventRegistrationUrl).toMatch(MEMBER_URL_PATTERN);
    expect(guestProps?.memberEventRegistrationUrl).toBeUndefined();
    expect(calls.length).toBe(2);
  });
});

describe("sendEventUpdatedToAllParticipants() の memberEventRegistrationUrl 出し分け", () => {
  test("会員申込には memberEventRegistrationUrl を含め、ゲスト申込には含めない", async () => {
    await sendEventUpdatedToAllParticipants(
      "evt-1",
      new Map([["slot-1", new Date("2098-12-25T01:00:00Z")]]),
    );

    const calls = mockEventUpdatedNotificationEmail.mock.calls;
    const memberProps = calls.find((c) =>
      c[0]?.memberEventRegistrationUrl?.includes("/mypage/events"),
    )?.[0];
    const guestProps = calls
      .map((c) => c[0])
      .find((p) => p?.memberEventRegistrationUrl === undefined);

    expect(memberProps?.memberEventRegistrationUrl).toMatch(MEMBER_URL_PATTERN);
    expect(guestProps?.memberEventRegistrationUrl).toBeUndefined();
    expect(calls.length).toBe(2);
  });
});
