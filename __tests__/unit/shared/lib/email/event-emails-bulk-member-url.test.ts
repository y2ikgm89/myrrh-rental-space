/**
 * イベント一括通知メール（中止・内容変更）の eventRegistrationHubUrl 出し分けテスト
 *
 * sendEventCancelledToAllParticipants() / sendEventUpdatedToAllParticipants() は
 * イベント単位で全参加者（会員・ゲスト混在）をループして送信する。会員は
 * mypage 詳細、ゲストは status token URL を eventRegistrationHubUrl として渡す。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

type EventRow = {
  title: string;
  format: "OFFLINE" | "ONLINE" | "HYBRID";
  meetingUrl: string | null;
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
    status?: string;
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
  status: "CONFIRMED",
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
  status: "CONFIRMED",
  slotId: "slot-1",
  slot: {
    startAt: new Date("2099-01-01T01:00:00Z"),
    endAt: new Date("2099-01-01T03:00:00Z"),
  },
};

function makeEventRow(): EventRow {
  return {
    title: "夏祭りワークショップ",
    format: "OFFLINE",
    meetingUrl: null,
    updatedAt: new Date("2099-01-01T00:00:00Z"),
    addressDetail: null,
    location: null,
    space: { name: "本館ホール" },
    registrations: [{ ...MEMBER_REGISTRATION }, { ...GUEST_REGISTRATION }],
  };
}

function makeCancelledPayload() {
  const row = makeEventRow();
  return {
    eventId: "evt-1",
    title: row.title,
    format: row.format,
    meetingUrl: row.meetingUrl,
    updatedAt: row.updatedAt,
    venueDisplay: row.space?.name ?? null,
    registrations: row.registrations.map((registration) => ({
      ...registration,
      status: RegistrationStatus.CONFIRMED,
    })),
  };
}

function makeUpdatedPayload() {
  const row = makeEventRow();
  return {
    eventId: "evt-1",
    title: row.title,
    format: row.format,
    meetingUrl: row.meetingUrl,
    updatedAt: row.updatedAt,
    venueDisplay: row.space?.name ?? null,
    registrations: row.registrations.map((registration) => ({
      id: registration.id,
      name: registration.name,
      email: registration.email,
      quantity: registration.quantity,
      icsSequence: registration.icsSequence,
      slotId: registration.slotId ?? "slot-1",
      customerId: registration.customerId,
      slot: registration.slot,
    })),
  };
}

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
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

type HubUrlProps = { eventRegistrationHubUrl?: string };
const mockEventCancelledNotificationEmail = mock((props: HubUrlProps) => props);
const mockEventUpdatedNotificationEmail = mock((props: HubUrlProps) => props);
mock.module("@/shared/emails/event-cancelled-notification", () => ({
  EventCancelledNotificationEmail: mockEventCancelledNotificationEmail,
}));
mock.module("@/shared/emails/event-updated-notification", () => ({
  EventUpdatedNotificationEmail: mockEventUpdatedNotificationEmail,
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";

import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";

const MEMBER_HUB_URL_PATTERN = /\/mypage\/events\/reg-member$/;
const GUEST_HUB_URL_PATTERN =
  /\/events\/registrations\/status\?token=[A-Za-z0-9_-]+$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockEventCancelledNotificationEmail.mockClear();
  mockEventUpdatedNotificationEmail.mockClear();
});

describe("sendEventCancelledToAllParticipants() の eventRegistrationHubUrl 出し分け", () => {
  test("会員は mypage 詳細、ゲストは status token URL を渡す", async () => {
    await sendEventCancelledToAllParticipants(
      makeCancelledPayload(),
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
      "講師都合のため中止",
    );

    const calls = mockEventCancelledNotificationEmail.mock.calls;
    const memberProps = calls.find((c) =>
      c[0]?.eventRegistrationHubUrl?.includes("/mypage/events/"),
    )?.[0];
    const guestProps = calls.find((c) =>
      c[0]?.eventRegistrationHubUrl?.includes(
        "/events/registrations/status?token=",
      ),
    )?.[0];

    expect(memberProps?.eventRegistrationHubUrl).toMatch(
      MEMBER_HUB_URL_PATTERN,
    );
    expect(guestProps?.eventRegistrationHubUrl).toMatch(GUEST_HUB_URL_PATTERN);
    expect(calls.length).toBe(2);
  });
});

describe("sendEventUpdatedToAllParticipants() の eventRegistrationHubUrl 出し分け", () => {
  test("会員は mypage 詳細、ゲストは status token URL を渡す", async () => {
    await sendEventUpdatedToAllParticipants(
      makeUpdatedPayload(),
      new Map([["slot-1", new Date("2098-12-25T01:00:00Z")]]),
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const calls = mockEventUpdatedNotificationEmail.mock.calls;
    const memberProps = calls.find((c) =>
      c[0]?.eventRegistrationHubUrl?.includes("/mypage/events/"),
    )?.[0];
    const guestProps = calls.find((c) =>
      c[0]?.eventRegistrationHubUrl?.includes(
        "/events/registrations/status?token=",
      ),
    )?.[0];

    expect(memberProps?.eventRegistrationHubUrl).toMatch(
      MEMBER_HUB_URL_PATTERN,
    );
    expect(guestProps?.eventRegistrationHubUrl).toMatch(GUEST_HUB_URL_PATTERN);
    expect(calls.length).toBe(2);
  });
});
