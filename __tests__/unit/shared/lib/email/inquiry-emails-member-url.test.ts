/**
 * お問い合わせ返信・ステータス通知メールの memberInquiryUrl 出し分けテスト
 *
 * sendInquiryReplyEmail() / sendInquiryStatusNotificationToAll() は、問い合わせに
 * 紐づく Customer.userId（Better Auth 連携済みの実アカウント）があるときだけ
 * 「マイページで確認する」リンクを含める。Inquiry.customerId 自体は
 * resolveOrCreateGuestInquiryCustomer が発行する userId=null のゲスト shell を
 * 指し得るため、customerId の有無ではなく customer.userId を見る必要がある —
 * この区別を誤ると全てのお問い合わせにマイページリンクが出る/出ない事故になる。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mock(() =>
    Promise.resolve({ notifyNewInquiry: true }),
  ),
  getNotificationEmailAddresses: mock(() =>
    Promise.resolve(["admin@example.com"]),
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
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

type MemberUrlProps = { memberInquiryUrl?: string };
const mockInquiryReplyEmail = mock((props: MemberUrlProps) => props);
const mockInquiryStatusNotificationEmail = mock(
  (props: MemberUrlProps) => props,
);
mock.module("@/shared/emails/inquiry-reply", () => ({
  InquiryReplyEmail: mockInquiryReplyEmail,
}));
mock.module("@/shared/emails/inquiry-status-notification", () => ({
  InquiryStatusNotificationEmail: mockInquiryStatusNotificationEmail,
}));

type InquiryRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  updatedAt: Date;
  customer: { userId: string | null } | null;
};

const MEMBER_INQUIRY: InquiryRow = {
  id: "inquiry-member-01",
  name: "会員 太郎",
  email: "member@example.com",
  subject: "会員からの問い合わせ",
  updatedAt: new Date("2099-01-01T00:00:00Z"),
  customer: { userId: "user-1" },
};

const GUEST_INQUIRY: InquiryRow = {
  id: "inquiry-guest-01",
  name: "ゲスト 花子",
  email: "guest@example.com",
  subject: "ゲストからの問い合わせ",
  updatedAt: new Date("2099-01-01T00:00:00Z"),
  customer: null,
};

const mockFindMany = mock<() => Promise<InquiryRow[]>>(() =>
  Promise.resolve([MEMBER_INQUIRY, GUEST_INQUIRY]),
);
mock.module("@/shared/db/prisma", () => ({
  prisma: { inquiry: { findMany: mockFindMany } },
  basePrisma: {},
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendInquiryReplyEmail,
  sendInquiryStatusNotificationToAll,
} from "@/shared/lib/email/inquiry-emails";
import type { InquiryReplyEmailData } from "@/shared/lib/email/types";

const REPLY_DATA: InquiryReplyEmailData = {
  inquiryId: "inquiry-abc123",
  customerName: "山田太郎",
  customerEmail: "yamada@example.com",
  originalSubject: "件名",
  originalMessage: "本文",
  replyMessage: "回答内容",
  repliedByName: "サポート担当",
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockInquiryReplyEmail.mockClear();
  mockInquiryStatusNotificationEmail.mockClear();
  mockFindMany.mockReset();
  mockFindMany.mockImplementation(() =>
    Promise.resolve([MEMBER_INQUIRY, GUEST_INQUIRY]),
  );
});

describe("sendInquiryReplyEmail() の memberInquiryUrl 出し分け", () => {
  test("customerUserId ありなら memberInquiryUrl を発行する", async () => {
    await sendInquiryReplyEmail({ ...REPLY_DATA, customerUserId: "user-1" });

    const props = mockInquiryReplyEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toMatch(
      /\/mypage\/inquiries\/inquiry-abc123$/,
    );
  });

  test("customerUserId が null（ゲスト shell 含む）なら memberInquiryUrl を発行しない", async () => {
    await sendInquiryReplyEmail({ ...REPLY_DATA, customerUserId: null });

    const props = mockInquiryReplyEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toBeUndefined();
  });
});

describe("sendInquiryStatusNotificationToAll() の memberInquiryUrl 出し分け", () => {
  test("customer.userId ありの問い合わせだけ memberInquiryUrl を含める", async () => {
    await sendInquiryStatusNotificationToAll(
      ["inquiry-member-01", "inquiry-guest-01"],
      "RESOLVED",
    );

    const calls = mockInquiryStatusNotificationEmail.mock.calls;
    expect(calls.length).toBe(2);

    const memberProps = calls.find((c) =>
      c[0]?.memberInquiryUrl?.includes("inquiry-member-01"),
    )?.[0];
    const guestProps = calls
      .map((c) => c[0])
      .find((p) => p?.memberInquiryUrl === undefined);

    expect(memberProps?.memberInquiryUrl).toMatch(
      /\/mypage\/inquiries\/inquiry-member-01$/,
    );
    expect(guestProps).toBeDefined();
  });
});
