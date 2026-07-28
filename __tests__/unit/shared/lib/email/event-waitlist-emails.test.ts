/**
 * event-waitlist-emails.ts の sender wrapper テスト。
 *
 * DB 読み込みは domain 側に移ったため、本テストは取得済み payload を渡した
 * render + send の挙動のみ検証する。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const GUEST_REGISTRATION = {
  id: "reg-1",
  name: "山田太郎",
  customerId: null as string | null,
  slotId: "slot-1",
  ticketId: "ticket-1",
  quantity: 2,
  waitlistedAt: new Date("2026-07-01T00:00:00Z"),
  eventTitle: "サマーワークショップ",
  eventSlug: "summer-workshop",
  slotStartAt: new Date("2099-01-01T05:00:00Z"),
  slotEndAt: new Date("2099-01-01T07:00:00Z"),
  ticketName: "一般チケット",
};

const MEMBER_REGISTRATION = {
  ...GUEST_REGISTRATION,
  id: "reg-2",
  customerId: "customer-1",
};

const mockSendEmail = mock<
  (params: unknown) => Promise<{ ok: true; messageId: string }>
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
      siteName: "Test Site",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

type RegisteredProps = {
  position: number;
  eventRegistrationHubUrl?: string;
  claimUrl?: string;
};
type OfferedProps = {
  actionUrl: string;
  eventRegistrationHubUrl: string;
  isPaid: boolean;
  priceDisplay?: string;
};
type ExpiredProps = { eventUrl: string };

const mockEventWaitlistRegisteredEmail = mock(
  (props: RegisteredProps) => props,
);
const mockEventWaitlistOfferedEmail = mock((props: OfferedProps) => props);
const mockEventWaitlistExpiredEmail = mock((props: ExpiredProps) => props);

mock.module("@/shared/emails/event-waitlist-registered", () => ({
  EventWaitlistRegisteredEmail: mockEventWaitlistRegisteredEmail,
}));
mock.module("@/shared/emails/event-waitlist-offered", () => ({
  EventWaitlistOfferedEmail: mockEventWaitlistOfferedEmail,
}));
mock.module("@/shared/emails/event-waitlist-expired", () => ({
  EventWaitlistExpiredEmail: mockEventWaitlistExpiredEmail,
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendEventWaitlistRegistered,
  sendEventWaitlistOffered,
  sendEventWaitlistExpired,
} from "@/shared/lib/email/event-waitlist-emails";

type SendEmailCall = {
  payload: { subject: string; to: string };
  idempotencyKey?: string;
};

function lastSendEmailCall(): SendEmailCall {
  const call = mockSendEmail.mock.calls.at(-1)?.[0] as
    SendEmailCall | undefined;
  if (!call) throw new Error("sendEmail was not called");
  return call;
}

beforeEach(() => {
  mockSendEmail.mockClear();
  mockEventWaitlistRegisteredEmail.mockClear();
  mockEventWaitlistOfferedEmail.mockClear();
  mockEventWaitlistExpiredEmail.mockClear();
});

describe("sendEventWaitlistRegistered", () => {
  test("subject に site name と event title の両方を含む", async () => {
    await sendEventWaitlistRegistered(
      {
        registration: GUEST_REGISTRATION,
        position: 3,
        to: "guest@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    const { subject } = lastSendEmailCall().payload;
    expect(subject).toContain("Test Site");
    expect(subject).toContain("サマーワークショップ");
  });

  test("position を props にそのまま渡す", async () => {
    await sendEventWaitlistRegistered(
      {
        registration: GUEST_REGISTRATION,
        position: 7,
        to: "guest@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.position).toBe(7);
  });

  test("ゲスト（customerId なし）は claimUrl と status hub URL を発行する", async () => {
    await sendEventWaitlistRegistered(
      {
        registration: GUEST_REGISTRATION,
        position: 1,
        to: "guest@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(
      /\/claim\/event-registration\?token=[A-Za-z0-9_-]+$/,
    );
    expect(props?.eventRegistrationHubUrl).toMatch(
      /\/events\/registrations\/status\?token=[A-Za-z0-9_-]+$/,
    );
  });

  test("会員（customerId あり）は mypage hub URL を発行し claimUrl は発行しない", async () => {
    await sendEventWaitlistRegistered(
      {
        registration: MEMBER_REGISTRATION,
        position: 1,
        to: "member@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventRegistrationHubUrl).toMatch(/\/mypage\/events\/reg-2$/);
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendEventWaitlistOffered", () => {
  test("free と paid で subject が異なる", async () => {
    await sendEventWaitlistOffered(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
        expiresAt: new Date("2099-01-02T00:00:00Z"),
        paymentContext: {
          kind: "free",
          confirmUrl: "https://example.com/events/waitlist/confirm?token=tok",
        },
      },
      EMAIL_SEND_CONTEXT,
    );
    const freeSubject = lastSendEmailCall().payload.subject;

    await sendEventWaitlistOffered(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
        expiresAt: new Date("2099-01-02T00:00:00Z"),
        paymentContext: {
          kind: "paid",
          checkoutUrl: "https://example.com/events/waitlist/checkout?token=tok",
          price: 3000,
        },
      },
      EMAIL_SEND_CONTEXT,
    );
    const paidSubject = lastSendEmailCall().payload.subject;

    expect(freeSubject).toContain("繰り上げ当選");
    expect(freeSubject).not.toContain("要お支払い");
    expect(paidSubject).toContain("要お支払い");
  });

  test("paid では priceDisplay と checkout actionUrl を渡す", async () => {
    await sendEventWaitlistOffered(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
        expiresAt: new Date("2099-01-02T00:00:00Z"),
        paymentContext: {
          kind: "paid",
          checkoutUrl: "https://example.com/events/waitlist/checkout?token=tok",
          price: 3000,
        },
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventWaitlistOfferedEmail.mock.calls.at(-1)?.[0];
    expect(props?.isPaid).toBe(true);
    expect(props?.priceDisplay).toBeDefined();
    expect(props?.actionUrl).toContain("/events/waitlist/checkout");
  });

  test("idempotencyKey に expiresAt.getTime() を含める", async () => {
    const expiresAt = new Date("2099-01-02T00:00:00Z");
    await sendEventWaitlistOffered(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
        expiresAt,
        paymentContext: {
          kind: "free",
          confirmUrl: "https://example.com/events/waitlist/confirm?token=tok",
        },
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(lastSendEmailCall().idempotencyKey).toBe(
      `event-waitlist-offered/reg-1/${expiresAt.getTime()}`,
    );
  });
});

describe("sendEventWaitlistExpired", () => {
  test("idempotencyKey が registrationId 固定", async () => {
    await sendEventWaitlistExpired(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(lastSendEmailCall().idempotencyKey).toBe(
      "event-waitlist-expired/reg-1",
    );
  });

  test("eventUrl に event slug を含む", async () => {
    await sendEventWaitlistExpired(
      {
        registration: GUEST_REGISTRATION,
        to: "guest@example.com",
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventWaitlistExpiredEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventUrl).toMatch(/\/events\/summer-workshop$/);
  });
});
