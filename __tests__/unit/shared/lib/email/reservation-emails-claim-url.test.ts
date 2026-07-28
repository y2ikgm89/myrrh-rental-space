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
import {
  EMAIL_SEND_CONTEXT,
  REMINDER_RENDER_CONTEXT,
  RESERVATION_RENDER_CONTEXT,
  RESERVATION_RENDER_CONTEXT_WITH_POLICY,
} from "./_email-test-fixtures";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

type ClaimUrlProps = {
  claimUrl?: string;
  memberReservationUrl?: string;
  bookingHubUrl?: string;
  cancellationPolicyUrl?: string;
  cancellationDeadlineHours?: number;
  modificationDeadlineHours?: number;
  receiptDownloadUrl?: string;
  smartLockPasscodes?: unknown;
};
const mockReservationConfirmationEmail = mock((props: ClaimUrlProps) => props);
const mockReservationReminderEmail = mock((props: ClaimUrlProps) => props);
const mockReservationCancelledEmail = mock((props: ClaimUrlProps) => props);

mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: () =>
    Promise.resolve({
      sendReservationConfirmationEmail: true,
      notifyNewReservation: true,
      notifyReservationChange: true,
      notifyReservationCancel: true,
      notifyNewInquiry: true,
      notifyEventRegistration: true,
      notifyEventCancellation: true,
      replyToEmail: null,
    }),
  getNotificationEmailAddresses: () => Promise.resolve(["admin@example.com"]),
  getCalendarEmailSettings: () =>
    Promise.resolve({
      icalAttachmentEnabled: false,
      addToCalendarLinksEnabled: false,
    }),
}));
mock.module("@/shared/domain/settings/queries/organization", () => ({
  getIcalOrganizer: () =>
    Promise.resolve({ name: "Org", email: "org@example.com" }),
}));
mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: () =>
    Promise.resolve({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 24,
    }),
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
const mockReservationStatusChangedEmail = mock((props: ClaimUrlProps) => props);
mock.module("@/shared/emails/reservation-status-changed", () => ({
  ReservationStatusChangedEmail: mockReservationStatusChangedEmail,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendReservationConfirmationEmail,
  sendReservationUpdatedEmail,
  sendReservationCancelledEmail,
  sendReservationStatusChangedEmail,
} from "@/shared/lib/email/reservation-emails";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import type {
  ReservationEmailData,
  ReminderEmailData,
  StatusChangeEmailData,
} from "@/shared/lib/email/types";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

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
const GUEST_STATUS_URL_PATTERN = /\/reservation\/status\?token=[A-Za-z0-9_-]+$/;
const CANCELLATION_POLICY_URL_PATTERN = /\/terms\/cancellation-policy$/;

const STATUS_CHANGED_DATA: StatusChangeEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPrice: 5000,
  oldStatus: ReservationStatus.PENDING,
  newStatus: ReservationStatus.CONFIRMED,
  icsSequence: 1,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockReservationConfirmationEmail.mockClear();
  mockReservationReminderEmail.mockClear();
  mockReservationCancelledEmail.mockClear();
  mockReservationUpdatedEmail.mockClear();
  mockReservationStatusChangedEmail.mockClear();
});

describe("sendReservationConfirmationEmail() の claimUrl 出し分け", () => {
  test("ゲスト予約（userId なし）は claimUrl を発行する", async () => {
    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員予約（userId あり）は claimUrl を発行しない", async () => {
    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

// 領収書 DL は発行通知メール (`sendReceiptIssuedEmail`) に集約。確認メールには載せない。
describe("sendReservationConfirmationEmail() は receiptDownloadUrl を載せない", () => {
  test("ゲスト予約でも receiptDownloadUrl を渡さない", async () => {
    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props).not.toHaveProperty("receiptDownloadUrl");
  });

  test("会員予約でも receiptDownloadUrl を渡さない", async () => {
    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props).not.toHaveProperty("receiptDownloadUrl");
  });
});

describe("sendReservationReminderEmail() の claimUrl 出し分け", () => {
  test("ゲスト予約（userId なし）は claimUrl を発行する", async () => {
    await sendReservationReminderEmail(
      {
        ...REMINDER_DATA,
        userId: null,
      },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toMatch(CLAIM_URL_PATTERN);
  });

  test("会員予約（userId あり）は claimUrl を発行しない", async () => {
    await sendReservationReminderEmail(
      {
        ...REMINDER_DATA,
        userId: "user-1",
      },
      REMINDER_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationReminderEmail.mock.calls.at(-1)?.[0];
    expect(props?.claimUrl).toBeUndefined();
  });
});

describe("sendReservationCancelledEmail() の memberReservationUrl 出し分け", () => {
  test("会員予約（userId あり）は memberReservationUrl を発行する", async () => {
    await sendReservationCancelledEmail(
      { ...CONFIRMATION_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト予約（userId なし）は memberReservationUrl を発行しない", async () => {
    await sendReservationCancelledEmail(
      { ...CONFIRMATION_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toBeUndefined();
  });
});

describe("cancellationPolicyUrl の配線（renderContext 経由）", () => {
  test("sendReservationConfirmationEmail: context に URL があれば渡す", async () => {
    await sendReservationConfirmationEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT_WITH_POLICY,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationConfirmationEmail: context に無ければ渡さない", async () => {
    await sendReservationConfirmationEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });

  test("sendReservationUpdatedEmail: context に URL があれば渡す", async () => {
    await sendReservationUpdatedEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT_WITH_POLICY,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationUpdatedEmail: context に無ければ渡さない", async () => {
    await sendReservationUpdatedEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });

  test("sendReservationCancelledEmail: context に URL があれば渡す", async () => {
    await sendReservationCancelledEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT_WITH_POLICY,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toMatch(
      CANCELLATION_POLICY_URL_PATTERN,
    );
  });

  test("sendReservationCancelledEmail: context に無ければ渡さない", async () => {
    await sendReservationCancelledEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationCancelledEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationPolicyUrl).toBeUndefined();
  });
});

describe("bookingHubUrl の出し分け（会員 mypage / ゲスト status）", () => {
  test("confirmation: 会員は mypage、ゲストは status token URL", async () => {
    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationConfirmationEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(MEMBER_URL_PATTERN);

    await sendReservationConfirmationEmail(
      { ...CONFIRMATION_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationConfirmationEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(GUEST_STATUS_URL_PATTERN);
  });

  test("updated: 会員は mypage、ゲストは status token URL", async () => {
    await sendReservationUpdatedEmail(
      { ...CONFIRMATION_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationUpdatedEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(MEMBER_URL_PATTERN);

    await sendReservationUpdatedEmail(
      { ...CONFIRMATION_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationUpdatedEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(GUEST_STATUS_URL_PATTERN);
  });

  test("status-changed: 会員は mypage、ゲストは status token URL", async () => {
    await sendReservationStatusChangedEmail(
      { ...STATUS_CHANGED_DATA, userId: "user-1" },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationStatusChangedEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(MEMBER_URL_PATTERN);

    await sendReservationStatusChangedEmail(
      { ...STATUS_CHANGED_DATA, userId: null },
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    expect(
      mockReservationStatusChangedEmail.mock.calls.at(-1)?.[0]?.bookingHubUrl,
    ).toMatch(GUEST_STATUS_URL_PATTERN);
  });
});

describe("confirmation/updated/status-changed は smartLockPasscodes を渡さない", () => {
  test("confirmation / updated / status-changed いずれも smartLockPasscodes を持たない", async () => {
    await sendReservationConfirmationEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    await sendReservationUpdatedEmail(
      CONFIRMATION_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );
    await sendReservationStatusChangedEmail(
      STATUS_CHANGED_DATA,
      RESERVATION_RENDER_CONTEXT,
      EMAIL_SEND_CONTEXT,
    );

    expect(
      mockReservationConfirmationEmail.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty("smartLockPasscodes");
    expect(
      mockReservationUpdatedEmail.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty("smartLockPasscodes");
    expect(
      mockReservationStatusChangedEmail.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty("smartLockPasscodes");
  });
});

describe("modificationDeadlineHours の配線（キャンセル期限と独立設定可能な変更期限）", () => {
  test("sendReservationConfirmationEmail: cancellationDeadlineHours と modificationDeadlineHours を別々に渡す", async () => {
    await sendReservationConfirmationEmail(
      CONFIRMATION_DATA,
      {
        ...RESERVATION_RENDER_CONTEXT,
        deadlineSettings: {
          cancellationDeadlineHours: 24,
          modificationDeadlineHours: 6,
        },
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationDeadlineHours).toBe(24);
    expect(props?.modificationDeadlineHours).toBe(6);
  });

  test("sendReservationUpdatedEmail: cancellationDeadlineHours と modificationDeadlineHours を別々に渡す", async () => {
    await sendReservationUpdatedEmail(
      CONFIRMATION_DATA,
      {
        ...RESERVATION_RENDER_CONTEXT,
        deadlineSettings: {
          cancellationDeadlineHours: 24,
          modificationDeadlineHours: 6,
        },
      },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockReservationUpdatedEmail.mock.calls.at(-1)?.[0];
    expect(props?.cancellationDeadlineHours).toBe(24);
    expect(props?.modificationDeadlineHours).toBe(6);
  });
});
