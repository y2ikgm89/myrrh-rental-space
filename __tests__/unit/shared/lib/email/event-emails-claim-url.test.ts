/**
 * ゲストのイベント参加申込メール（確認・リマインダー）の claimUrl /
 * eventRegistrationHubUrl 出し分けテスト
 *
 * sendEventRegistrationConfirmation() / sendEventReminderEmail() は
 * ゲスト申込（customerId が null/undefined）のときだけ「マイページに追加」
 * claim リンクを本文に含め、会員・ゲストともに eventRegistrationHubUrl
 * （会員 mypage 詳細 / ゲスト status token）を含める。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

type HubUrlProps = {
  claimUrl?: string;
  eventRegistrationHubUrl?: string;
  receiptDownloadUrl?: string;
};
const mockEventRegistrationConfirmationEmail = mock(
  (props: HubUrlProps) => props,
);
const mockEventReminderEmail = mock((props: HubUrlProps) => props);

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
mock.module("@/shared/emails/event-registration-confirmation", () => ({
  EventRegistrationConfirmationEmail: mockEventRegistrationConfirmationEmail,
}));
mock.module("@/shared/emails/event-reminder", () => ({
  EventReminderEmail: mockEventReminderEmail,
}));

import { EMAIL_SEND_CONTEXT, RENDER_CONTEXT } from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendEventRegistrationConfirmation,
  sendEventReminderEmail,
} from "@/shared/lib/email/event-emails";

const REGISTRATION_DATA: {
  registrationId: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: undefined;
  quantity: number;
  icsSequence: number;
  format: EventFormatValue;
  meetingUrl: null;
} = {
  registrationId: "registration-abcd12",
  customerName: "山田太郎",
  customerEmail: "participant@example.com",
  eventTitle: "ワークショップ",
  eventStartTime: new Date("2099-01-01T01:00:00Z"),
  eventEndTime: new Date("2099-01-01T03:00:00Z"),
  location: undefined,
  quantity: 1,
  icsSequence: 0,
  format: "OFFLINE",
  meetingUrl: null,
};

const REMINDER_DATA: {
  registrationId: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: undefined;
  quantity: number;
  icsSequence: number;
  format: EventFormatValue;
  meetingUrl: null;
} = {
  registrationId: "registration-abcd12",
  customerName: "山田太郎",
  customerEmail: "participant@example.com",
  eventTitle: "ワークショップ",
  eventStartTime: new Date("2099-01-01T01:00:00Z"),
  eventEndTime: new Date("2099-01-01T03:00:00Z"),
  location: undefined,
  quantity: 1,
  icsSequence: 0,
  format: "OFFLINE",
  meetingUrl: null,
};

const CLAIM_URL_PATTERN = /\/claim\/event-registration\?token=[A-Za-z0-9_-]+$/;
const MEMBER_HUB_URL_PATTERN = /\/mypage\/events\/registration-abcd12$/;
const GUEST_HUB_URL_PATTERN =
  /\/events\/registrations\/status\?token=[A-Za-z0-9_-]+$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockEventRegistrationConfirmationEmail.mockClear();
  mockEventReminderEmail.mockClear();
});

describe("sendEventRegistrationConfirmation() の claimUrl 出し分け", () => {
  test("ゲスト申込（customerId なし）は claimUrl を発行する", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: null,
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員申込（customerId あり）は claimUrl を発行しない", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: "customer-1",
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendEventReminderEmail() の claimUrl 出し分け", () => {
  test("ゲスト申込（customerId なし）は claimUrl を発行する", async () => {
    await sendEventReminderEmail(
      {
        ...REMINDER_DATA,
        customerId: null,
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員申込（customerId あり）は claimUrl を発行しない", async () => {
    await sendEventReminderEmail(
      {
        ...REMINDER_DATA,
        customerId: "customer-1",
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendEventRegistrationConfirmation() の eventRegistrationHubUrl 出し分け", () => {
  test("会員申込は mypage 詳細 URL を発行する", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: "customer-1",
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventRegistrationHubUrl).toMatch(MEMBER_HUB_URL_PATTERN);
  });

  test("ゲスト申込は status token URL を発行する", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: null,
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventRegistrationHubUrl).toMatch(GUEST_HUB_URL_PATTERN);
  });
});

// 領収書 DL は発行通知メール (`sendReceiptIssuedEmail`) に集約。確認メールには載せない。
describe("sendEventRegistrationConfirmation() は receiptDownloadUrl を載せない", () => {
  test("ゲスト申込でも receiptDownloadUrl を渡さない", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: null,
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props).not.toHaveProperty("receiptDownloadUrl");
  });

  test("会員申込でも receiptDownloadUrl を渡さない", async () => {
    await sendEventRegistrationConfirmation(
      {
        ...REGISTRATION_DATA,
        customerId: "customer-1",
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props).not.toHaveProperty("receiptDownloadUrl");
  });
});

describe("sendEventReminderEmail() の eventRegistrationHubUrl 出し分け", () => {
  test("会員申込は mypage 詳細 URL を発行する", async () => {
    await sendEventReminderEmail(
      {
        ...REMINDER_DATA,
        customerId: "customer-1",
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventRegistrationHubUrl).toMatch(MEMBER_HUB_URL_PATTERN);
  });

  test("ゲスト申込は status token URL を発行する", async () => {
    await sendEventReminderEmail(
      {
        ...REMINDER_DATA,
        customerId: null,
      },
      RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.eventRegistrationHubUrl).toMatch(GUEST_HUB_URL_PATTERN);
  });
});
