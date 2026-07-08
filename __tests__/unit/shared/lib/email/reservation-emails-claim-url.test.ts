/**
 * ゲスト予約メール（確認・リマインダー・キャンセル）の claimUrl /
 * memberReservationUrl 出し分けテスト
 *
 * sendReservationConfirmationEmail() / sendReservationReminderEmail() は
 * ゲスト予約（userId が null/undefined）のときだけ「マイページに追加」claim
 * リンクを本文に含め、会員予約（userId あり）のときだけ
 * memberReservationUrl（マイページ詳細リンク）を本文に含める。
 * sendReservationCancelledEmail() も同じ memberReservationUrl 出し分けを行う
 * （こちらは claimUrl を持たない — キャンセル済み予約をゲストがマイページに
 * 追加する意味が無いため）。
 *
 * このゲートは `data.userId ? undefined : <mint token>` という三項演算子1本で
 * 実装されており、条件を反転する取り違えが起きても型チェック・lint では検出
 * できない。メールテンプレートコンポーネントをモックして実際に渡された props
 * を検証することで、出し分けの向きを固定する回帰テスト。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

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
const mockGetIcalOrganizer = mock<
  () => Promise<{ name: string; email: string }>
>(() => Promise.resolve({ name: "Org", email: "org@example.com" }));
const mockGetReservationDeadlineSettings = mock<
  () => Promise<{
    cancellationDeadlineHours: number;
    modificationDeadlineHours: number;
  }>
>(() =>
  Promise.resolve({
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,
  }),
);

type ClaimUrlProps = {
  claimUrl?: string;
  memberReservationUrl?: string;
  cancellationPolicyUrl?: string;
  cancellationDeadlineHours?: number;
  modificationDeadlineHours?: number;
};
const mockReservationConfirmationEmail = mock((props: ClaimUrlProps) => props);
const mockReservationReminderEmail = mock((props: ClaimUrlProps) => props);
const mockReservationCancelledEmail = mock((props: ClaimUrlProps) => props);

const mockGetPublishedTermsByType = mock<
  () => Promise<{ slug: string; title: string } | null>
>(() => Promise.resolve(null));

mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
  getCalendarEmailSettings: mockGetCalendarEmailSettings,
}));
mock.module("@/shared/domain/terms/queries", () => ({
  getPublishedTermsByType: mockGetPublishedTermsByType,
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: mockGetIcalOrganizer,
}));
mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mockGetReservationDeadlineSettings,
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
mock.module("@/shared/emails/reservation-confirmation", () => ({
  ReservationConfirmationEmail: mockReservationConfirmationEmail,
}));
mock.module("@/shared/emails/reservation-reminder", () => ({
  ReservationReminderEmail: mockReservationReminderEmail,
}));
mock.module("@/shared/emails/reservation-cancelled", () => ({
  ReservationCancelledEmail: mockReservationCancelledEmail,
}));
const mockReservationUpdatedEmail = mock((props: ClaimUrlProps) => props);
mock.module("@/shared/emails/reservation-updated", () => ({
  ReservationUpdatedEmail: mockReservationUpdatedEmail,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendReservationConfirmationEmail,
  sendReservationUpdatedEmail,
  sendReservationCancelledEmail,
} from "@/shared/lib/email/reservation-emails";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import type {
  ReservationEmailData,
  ReminderEmailData,
} from "@/shared/lib/email/types";

const CONFIRMATION_DATA: ReservationEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPrice: 5000,
  icsSequence: 0,
};

const REMINDER_DATA: ReminderEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  location: undefined,
  notes: undefined,
  icsSequence: 0,
};

const CLAIM_URL_PATTERN = /\/claim\/reservation\?token=[A-Za-z0-9_-]+$/;
const MEMBER_URL_PATTERN = /\/mypage\/reservations\/reservation-abcdef12$/;
const CANCELLATION_POLICY_URL_PATTERN = /\/terms\/cancellation-policy$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
  mockReservationConfirmationEmail.mockClear();
  mockReservationReminderEmail.mockClear();
  mockReservationCancelledEmail.mockClear();
  mockReservationUpdatedEmail.mockClear();
  mockGetPublishedTermsByType.mockReset();
  mockGetPublishedTermsByType.mockResolvedValue({
    slug: "cancellation-policy",
    title: "キャンセルポリシー",
  });
});

describe("sendReservationConfirmationEmail() の claimUrl 出し分け", () => {
  test("ゲスト予約（userId なし）は claimUrl を発行する", async () => {
    await sendReservationConfirmationEmail({
      ...CONFIRMATION_DATA,
      userId: null,
    });

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員予約（userId あり）は claimUrl を発行しない", async () => {
    await sendReservationConfirmationEmail({
      ...CONFIRMATION_DATA,
      userId: "user-1",
    });

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendReservationReminderEmail() の claimUrl 出し分け", () => {
  test("ゲスト予約（userId なし）は claimUrl を発行する", async () => {
    await sendReservationReminderEmail({
      ...REMINDER_DATA,
      userId: null,
    });

    const props = mockReservationReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員予約（userId あり）は claimUrl を発行しない", async () => {
    await sendReservationReminderEmail({
      ...REMINDER_DATA,
      userId: "user-1",
    });

    const props = mockReservationReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendReservationCancelledEmail() の memberReservationUrl 出し分け", () => {
  test("会員予約（userId あり）は memberReservationUrl を発行する", async () => {
    await sendReservationCancelledEmail({
      ...CONFIRMATION_DATA,
      userId: "user-1",
    });

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト予約（userId なし）は memberReservationUrl を発行しない", async () => {
    await sendReservationCancelledEmail({
      ...CONFIRMATION_DATA,
      userId: null,
    });

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toBeUndefined();
  });
});

describe("cancellationPolicyUrl の出し分け（公開中のキャンセルポリシー文書の有無）", () => {
  test("sendReservationConfirmationEmail: 文書が公開中なら cancellationPolicyUrl を発行する", async () => {
    await sendReservationConfirmationEmail(CONFIRMATION_DATA);

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationConfirmationEmail: 文書が無ければ cancellationPolicyUrl を発行しない", async () => {
    mockGetPublishedTermsByType.mockResolvedValueOnce(null);

    await sendReservationConfirmationEmail(CONFIRMATION_DATA);

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });

  test("sendReservationUpdatedEmail: 文書が公開中なら cancellationPolicyUrl を発行する", async () => {
    await sendReservationUpdatedEmail(CONFIRMATION_DATA);

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationUpdatedEmail: 文書が無ければ cancellationPolicyUrl を発行しない", async () => {
    mockGetPublishedTermsByType.mockResolvedValueOnce(null);

    await sendReservationUpdatedEmail(CONFIRMATION_DATA);

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });

  test("sendReservationCancelledEmail: 文書が公開中なら cancellationPolicyUrl を発行する", async () => {
    await sendReservationCancelledEmail(CONFIRMATION_DATA);

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationCancelledEmail: 文書が無ければ cancellationPolicyUrl を発行しない", async () => {
    mockGetPublishedTermsByType.mockResolvedValueOnce(null);

    await sendReservationCancelledEmail(CONFIRMATION_DATA);

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });
});

describe("modificationDeadlineHours の配線（キャンセル期限と独立設定可能な変更期限）", () => {
  test("sendReservationConfirmationEmail: cancellationDeadlineHours と modificationDeadlineHours を別々に渡す", async () => {
    mockGetReservationDeadlineSettings.mockResolvedValueOnce({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 6,
    });

    await sendReservationConfirmationEmail(CONFIRMATION_DATA);

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationDeadlineHours).toBe(24);
    expect(props?.modificationDeadlineHours).toBe(6);
  });

  test("sendReservationUpdatedEmail: cancellationDeadlineHours と modificationDeadlineHours を別々に渡す", async () => {
    mockGetReservationDeadlineSettings.mockResolvedValueOnce({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 6,
    });

    await sendReservationUpdatedEmail(CONFIRMATION_DATA);

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationDeadlineHours).toBe(24);
    expect(props?.modificationDeadlineHours).toBe(6);
  });
});
