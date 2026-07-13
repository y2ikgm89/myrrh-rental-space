/**
 * event-waitlist-emails.ts の sender wrapper テスト。
 *
 * - sendEventWaitlistRegistered: subject に site name + event title を含むこと、
 *   position が (slotId, ticketId) スコープの count() 結果をそのまま props に渡すこと
 * - sendEventWaitlistOffered: paymentContext.kind (free/paid) で subject/props が
 *   分岐すること（price 表示・actionUrl の出し分け）
 * - sendEventWaitlistExpired: idempotencyKey が `event-waitlist-expired/<id>` で
 *   固定（再送で同一 key）であること
 * - registrationId に該当データが無い場合は 3 関数とも `{ok:false, reason:"not_found"}`
 *   を返し throw しないこと
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

type RegistrationRow = {
  id: string;
  name: string;
  customerId: string | null;
  slotId: string;
  ticketId: string;
  quantity: number;
  waitlistedAt: Date | null;
  event: { title: string; slug: string };
  slot: { startAt: Date; endAt: Date };
  ticket: { name: string };
};

const GUEST_REGISTRATION: RegistrationRow = {
  id: "reg-1",
  name: "山田太郎",
  customerId: null,
  slotId: "slot-1",
  ticketId: "ticket-1",
  quantity: 2,
  waitlistedAt: new Date("2026-07-01T00:00:00Z"),
  event: { title: "サマーワークショップ", slug: "summer-workshop" },
  slot: {
    startAt: new Date("2099-01-01T05:00:00Z"),
    endAt: new Date("2099-01-01T07:00:00Z"),
  },
  ticket: { name: "一般チケット" },
};

const MEMBER_REGISTRATION: RegistrationRow = {
  ...GUEST_REGISTRATION,
  id: "reg-2",
  customerId: "customer-1",
};

const mockFindUnique = mock<() => Promise<RegistrationRow | null>>(() =>
  Promise.resolve(GUEST_REGISTRATION),
);
const mockCount = mock<() => Promise<number>>(() => Promise.resolve(3));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: { findUnique: mockFindUnique, count: mockCount },
  },
  basePrisma: {},
}));

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
  memberEventRegistrationUrl?: string;
  claimUrl?: string;
};
type OfferedProps = {
  actionUrl: string;
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
  mockFindUnique.mockReset();
  mockFindUnique.mockImplementation(() => Promise.resolve(GUEST_REGISTRATION));
  mockCount.mockReset();
  mockCount.mockImplementation(() => Promise.resolve(3));
  mockSendEmail.mockClear();
  mockEventWaitlistRegisteredEmail.mockClear();
  mockEventWaitlistOfferedEmail.mockClear();
  mockEventWaitlistExpiredEmail.mockClear();
});

describe("sendEventWaitlistRegistered", () => {
  test("subject に site name と event title の両方を含む", async () => {
    await sendEventWaitlistRegistered({
      registrationId: "reg-1",
      to: "guest@example.com",
    });

    const { subject } = lastSendEmailCall().payload;
    expect(subject).toContain("Test Site");
    expect(subject).toContain("サマーワークショップ");
  });

  test("position は (slotId, ticketId) スコープの count() 結果をそのまま使う", async () => {
    mockCount.mockImplementation(() => Promise.resolve(7));
    await sendEventWaitlistRegistered({
      registrationId: "reg-1",
      to: "guest@example.com",
    });

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.position).toBe(7);
  });

  test("ゲスト（customerId なし）は claimUrl を発行し memberEventRegistrationUrl は発行しない", async () => {
    mockFindUnique.mockImplementation(() =>
      Promise.resolve(GUEST_REGISTRATION),
    );
    await sendEventWaitlistRegistered({
      registrationId: "reg-1",
      to: "guest@example.com",
    });

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(
      /\/claim\/event-registration\?token=[A-Za-z0-9_-]+$/,
    );
    expect(props?.memberEventRegistrationUrl).toBeUndefined();
  });

  test("会員（customerId あり）は memberEventRegistrationUrl を発行し claimUrl は発行しない", async () => {
    mockFindUnique.mockImplementation(() =>
      Promise.resolve(MEMBER_REGISTRATION),
    );
    await sendEventWaitlistRegistered({
      registrationId: "reg-2",
      to: "member@example.com",
    });

    const props = mockEventWaitlistRegisteredEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberEventRegistrationUrl).toMatch(/\/mypage\/events$/);
    expect(props?.claimUrl).toBeUndefined();
  });

  test("登録が見つからない場合は not_found を返し throw しない", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));
    const result = await sendEventWaitlistRegistered({
      registrationId: "missing",
      to: "guest@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sendEventWaitlistOffered", () => {
  test("free と paid で subject が異なる", async () => {
    await sendEventWaitlistOffered({
      registrationId: "reg-1",
      to: "guest@example.com",
      expiresAt: new Date("2099-01-02T00:00:00Z"),
      paymentContext: {
        kind: "free",
        confirmUrl: "https://example.com/events/waitlist/confirm?token=tok",
      },
    });
    const freeSubject = lastSendEmailCall().payload.subject;

    await sendEventWaitlistOffered({
      registrationId: "reg-1",
      to: "guest@example.com",
      expiresAt: new Date("2099-01-02T00:00:00Z"),
      paymentContext: {
        kind: "paid",
        checkoutUrl: "https://example.com/events/waitlist/checkout/tok",
        price: 3000,
      },
    });
    const paidSubject = lastSendEmailCall().payload.subject;

    expect(freeSubject).not.toBe(paidSubject);
    expect(freeSubject).toContain("サマーワークショップ");
    expect(paidSubject).toContain("サマーワークショップ");
  });

  test("free branch: actionUrl は confirmUrl、priceDisplay は無い", async () => {
    await sendEventWaitlistOffered({
      registrationId: "reg-1",
      to: "guest@example.com",
      expiresAt: new Date("2099-01-02T00:00:00Z"),
      paymentContext: {
        kind: "free",
        confirmUrl: "https://example.com/events/waitlist/confirm?token=tok",
      },
    });

    const props = mockEventWaitlistOfferedEmail.mock.calls.at(-1)?.[0];
    expect(props?.isPaid).toBe(false);
    expect(props?.actionUrl).toBe(
      "https://example.com/events/waitlist/confirm?token=tok",
    );
    expect(props?.priceDisplay).toBeUndefined();
  });

  test("paid branch: actionUrl は checkoutUrl、priceDisplay は円表示", async () => {
    await sendEventWaitlistOffered({
      registrationId: "reg-1",
      to: "guest@example.com",
      expiresAt: new Date("2099-01-02T00:00:00Z"),
      paymentContext: {
        kind: "paid",
        checkoutUrl: "https://example.com/events/waitlist/checkout/tok",
        price: 3000,
      },
    });

    const props = mockEventWaitlistOfferedEmail.mock.calls.at(-1)?.[0];
    expect(props?.isPaid).toBe(true);
    expect(props?.actionUrl).toBe(
      "https://example.com/events/waitlist/checkout/tok",
    );
    expect(props?.priceDisplay).toContain("3,000");
  });

  test("idempotencyKey は registrationId と expiresAt.getTime() の両方を含む", async () => {
    const expiresAt = new Date("2099-01-02T03:04:05.000Z");
    await sendEventWaitlistOffered({
      registrationId: "reg-1",
      to: "guest@example.com",
      expiresAt,
      paymentContext: { kind: "free", confirmUrl: "https://example.com/x" },
    });

    expect(lastSendEmailCall().idempotencyKey).toBe(
      `event-waitlist-offered/reg-1/${expiresAt.getTime()}`,
    );
  });

  test("登録が見つからない場合は not_found を返す", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));
    const result = await sendEventWaitlistOffered({
      registrationId: "missing",
      to: "guest@example.com",
      expiresAt: new Date(),
      paymentContext: { kind: "free", confirmUrl: "https://example.com/x" },
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("sendEventWaitlistExpired", () => {
  test("idempotencyKey は event-waitlist-expired/<id> で固定（再送で同一 key）", async () => {
    await sendEventWaitlistExpired({
      registrationId: "reg-1",
      to: "guest@example.com",
    });
    const firstKey = lastSendEmailCall().idempotencyKey;
    expect(firstKey).toBe("event-waitlist-expired/reg-1");

    mockSendEmail.mockClear();
    await sendEventWaitlistExpired({
      registrationId: "reg-1",
      to: "guest@example.com",
    });
    const secondKey = lastSendEmailCall().idempotencyKey;

    expect(secondKey).toBe(firstKey);
  });

  test("eventUrl はイベント detail page (/events/<slug>) を指す", async () => {
    await sendEventWaitlistExpired({
      registrationId: "reg-1",
      to: "guest@example.com",
    });

    const props = mockEventWaitlistExpiredEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventUrl).toContain("/events/summer-workshop");
  });

  test("登録が見つからない場合は not_found を返す", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));
    const result = await sendEventWaitlistExpired({
      registrationId: "missing",
      to: "guest@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
