/**
 * ゲストのイベント参加申込メール（確認・リマインダー）の claimUrl /
 * memberEventRegistrationUrl 出し分けテスト
 *
 * sendEventRegistrationConfirmation() / sendEventReminderEmail() は
 * ゲスト申込（customerId が null/undefined）のときだけ「マイページに追加」
 * claim リンクを本文に含め、会員申込（customerId あり）のときだけ
 * 「マイページで申込を確認する」memberEventRegistrationUrl を含める。
 * 両者は互いに排他（予約系と同一モデル、`reservation-emails.ts` 参照）。
 *
 * このゲートは `data.customerId ? undefined : <mint token>` という三項演算子
 * 1本で実装されており、条件を反転する取り違えが起きても型チェック・lint では
 * 検出できない。メールテンプレートコンポーネントをモックして実際に渡された
 * props を検証することで、出し分けの向きを固定する回帰テスト。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

type DeliverySettings = {
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyEventRegistration: boolean;
  notifyEventCancellation: boolean;
  replyToEmail: string | null;
};

const DELIVERY_DEFAULTS: DeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  notifyEventRegistration: true,
  notifyEventCancellation: true,
  replyToEmail: null,
};

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
const mockGetEmailDeliverySettings = mock<() => Promise<DeliverySettings>>(() =>
  Promise.resolve(DELIVERY_DEFAULTS),
);
const mockGetNotificationEmailAddresses = mock<() => Promise<string[]>>(() =>
  Promise.resolve(["admin@example.com"]),
);
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

type ClaimUrlProps = {
  claimUrl?: string;
  memberEventRegistrationUrl?: string;
};
const mockEventRegistrationConfirmationEmail = mock(
  (props: ClaimUrlProps) => props,
);
const mockEventReminderEmail = mock((props: ClaimUrlProps) => props);

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: () =>
    Promise.resolve({ name: "Org", email: "org@example.com" }),
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
mock.module("@/shared/emails/event-registration-confirmation", () => ({
  EventRegistrationConfirmationEmail: mockEventRegistrationConfirmationEmail,
}));
mock.module("@/shared/emails/event-reminder", () => ({
  EventReminderEmail: mockEventReminderEmail,
}));

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
const MEMBER_URL_PATTERN = /\/mypage\/events$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
  mockEventRegistrationConfirmationEmail.mockClear();
  mockEventReminderEmail.mockClear();
});

describe("sendEventRegistrationConfirmation() の claimUrl 出し分け", () => {
  test("ゲスト申込（customerId なし）は claimUrl を発行する", async () => {
    await sendEventRegistrationConfirmation({
      ...REGISTRATION_DATA,
      customerId: null,
    });

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員申込（customerId あり）は claimUrl を発行しない", async () => {
    await sendEventRegistrationConfirmation({
      ...REGISTRATION_DATA,
      customerId: "customer-1",
    });

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendEventReminderEmail() の claimUrl 出し分け", () => {
  test("ゲスト申込（customerId なし）は claimUrl を発行する", async () => {
    await sendEventReminderEmail({
      ...REMINDER_DATA,
      customerId: null,
    });

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員申込（customerId あり）は claimUrl を発行しない", async () => {
    await sendEventReminderEmail({
      ...REMINDER_DATA,
      customerId: "customer-1",
    });

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendEventRegistrationConfirmation() の memberEventRegistrationUrl 出し分け", () => {
  test("会員申込（customerId あり）は memberEventRegistrationUrl を発行する", async () => {
    await sendEventRegistrationConfirmation({
      ...REGISTRATION_DATA,
      customerId: "customer-1",
    });

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberEventRegistrationUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト申込（customerId なし）は memberEventRegistrationUrl を発行しない", async () => {
    await sendEventRegistrationConfirmation({
      ...REGISTRATION_DATA,
      customerId: null,
    });

    const props = mockEventRegistrationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberEventRegistrationUrl).toBeUndefined();
  });
});

describe("sendEventReminderEmail() の memberEventRegistrationUrl 出し分け", () => {
  test("会員申込（customerId あり）は memberEventRegistrationUrl を発行する", async () => {
    await sendEventReminderEmail({
      ...REMINDER_DATA,
      customerId: "customer-1",
    });

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberEventRegistrationUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト申込（customerId なし）は memberEventRegistrationUrl を発行しない", async () => {
    await sendEventReminderEmail({
      ...REMINDER_DATA,
      customerId: null,
    });

    const props = mockEventReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberEventRegistrationUrl).toBeUndefined();
  });
});
