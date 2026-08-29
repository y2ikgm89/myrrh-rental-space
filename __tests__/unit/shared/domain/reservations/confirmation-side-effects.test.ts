/**
 * applyConfirmationSideEffects（確定後 smart-lock + 確認メール）の単体テスト。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailRenderContextMock } from "../../../../support/email-render-context-mock";
import { installErrorsServerMock } from "../../../../mocks/errors-server";

mock.module("server-only", () => ({}));

const OK_EMAIL_RESULT = { ok: true } as const;
const noopReservationEmailAsync = mock(async () => OK_EMAIL_RESULT);

const START_TIME = new Date("2027-03-01T01:00:00.000Z");
const END_TIME = new Date("2027-03-01T03:00:00.000Z");
const SPACE_ID = "22222222-2222-4222-8222-222222222222";

const payload = {
  reservationId: "11111111-1111-4111-8111-111111111111",
  customerEmail: "guest@example.com",
  customerName: "Guest User",
  spaceName: "Test Space",
  startTime: START_TIME,
  endTime: END_TIME,
  totalPrice: 5000,
  totalPriceWithTax: 5000,
  icsSequence: 0,
};

const mockIssueSmartLockPasscodes = mock(async () => ({
  passcodes: [],
  issuanceFailed: false,
}));
const mockSendReservationConfirmationEmail = mock<
  (data: Record<string, unknown>) => Promise<void>
>(async () => undefined);
const mockLogError = mock<(err: unknown, ctx: unknown) => void>(() => {});

mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  issueSmartLockPasscodes: mockIssueSmartLockPasscodes,
}));

const mockClearConfirmationEmailPending = mock<
  (reservationId: string) => Promise<void>
>(async () => undefined);

const mockMarkConfirmationEmailPending = mock<
  (reservationId: string) => Promise<void>
>(async () => undefined);

mock.module("@/shared/domain/reservations/confirmation-email-pending", () => ({
  clearConfirmationEmailPending: mockClearConfirmationEmailPending,
  markConfirmationEmailPending: mockMarkConfirmationEmailPending,
}));

installEmailRenderContextMock();

mock.module("@/shared/lib/email/reservation-emails", () => ({
  buildMemberReservationUrl: () => "",
  buildBookingHubUrl: () => "",
  sendReservationConfirmationEmail: mockSendReservationConfirmationEmail,
  sendReservationUpdatedEmail: noopReservationEmailAsync,
  sendReservationCancelledEmail: noopReservationEmailAsync,
  sendReservationStatusChangedEmail: noopReservationEmailAsync,
  sendReservationRefundEmail: noopReservationEmailAsync,
  sendReservationAdminNotification: noopReservationEmailAsync,
  sendBulkReservationCancelledEmail: noopReservationEmailAsync,
  sendBulkAdminNotification: noopReservationEmailAsync,
}));

await installErrorsServerMock({
  logError: (err, ctx) => mockLogError(err, ctx),
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
});

const { applyConfirmationSideEffects } =
  await import("@/shared/domain/reservations/confirmation-side-effects");

describe("applyConfirmationSideEffects", () => {
  beforeEach(() => {
    mockIssueSmartLockPasscodes.mockClear();
    mockSendReservationConfirmationEmail.mockClear();
    mockLogError.mockClear();
    mockClearConfirmationEmailPending.mockClear();
    mockMarkConfirmationEmailPending.mockClear();
    mockMarkConfirmationEmailPending.mockImplementation(async () => undefined);
    mockIssueSmartLockPasscodes.mockImplementation(async () => ({
      passcodes: [],
      issuanceFailed: false,
    }));
    // mockClear は実装を戻さない。失敗を注入するテストがあるので毎回張り直す。
    mockSendReservationConfirmationEmail.mockImplementation(
      async () => undefined,
    );
  });

  test("passcode の poll に入る前に送信待ちマーカーを立てる", async () => {
    // **順序がこのテストの全て。** poll の後に立てても、守りたい 150 秒の区間は
    // 既に過ぎている。管理画面経路はここが唯一の設定点なので、後ろにずれると
    // 管理予約の確認メールは回収できないまま消える。
    let markedBeforePoll = false;
    mockIssueSmartLockPasscodes.mockImplementation(async () => {
      markedBeforePoll = mockMarkConfirmationEmailPending.mock.calls.length > 0;
      return { passcodes: [], issuanceFailed: false };
    });

    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "admin",
    });

    expect(markedBeforePoll).toBe(true);
    expect(mockMarkConfirmationEmailPending).toHaveBeenCalledWith(
      payload.reservationId,
    );
  });

  test("マーカーを立てられなくてもメールは送る", async () => {
    // マーカーは安全網であって前提条件ではない。ここで送信を止めると、
    // 取りこぼしを減らすための変更が取りこぼしを増やす。
    mockMarkConfirmationEmailPending.mockImplementation(async () => {
      throw new Error("db hiccup");
    });

    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "customer",
    });

    expect(mockSendReservationConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  test("送信できたら送信待ちマーカーを下ろす", async () => {
    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "customer",
    });

    expect(mockClearConfirmationEmailPending).toHaveBeenCalledWith(
      payload.reservationId,
    );
  });

  test("送信に失敗したら送信待ちマーカーを残す", async () => {
    // **この 1 本がこの列の存在理由。** マーカーが残ることだけが再試行の手段で、
    // 下ろしてしまうと cron は回収できず、確認メールが回収不能に消える。
    mockSendReservationConfirmationEmail.mockImplementation(async () => {
      throw new Error("resend down");
    });

    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "customer",
    });

    expect(mockClearConfirmationEmailPending).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("passcode 発行後に確認メールを送る", async () => {
    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "customer",
    });

    expect(mockIssueSmartLockPasscodes).toHaveBeenCalledTimes(1);
    expect(mockSendReservationConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendReservationConfirmationEmail.mock.calls[0]?.[0]).toEqual(
      payload,
    );
  });

  test("issuanceFailed=true のとき smartLockIssuanceFailed を付与する", async () => {
    mockIssueSmartLockPasscodes.mockImplementation(async () => ({
      passcodes: [],
      issuanceFailed: true,
    }));

    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "admin",
    });

    expect(mockSendReservationConfirmationEmail.mock.calls[0]?.[0]).toEqual({
      ...payload,
      smartLockIssuanceFailed: true,
    });
  });

  test("sendCustomerEmail=false なら passcode のみで確認メールは送らない", async () => {
    await applyConfirmationSideEffects({
      payload,
      spaceId: SPACE_ID,
      channel: "admin",
      sendCustomerEmail: false,
    });

    expect(mockIssueSmartLockPasscodes).toHaveBeenCalledTimes(1);
    expect(mockSendReservationConfirmationEmail).not.toHaveBeenCalled();
    // 「送らない」と確定した経路。立てず、残っていれば下ろす。
    expect(mockMarkConfirmationEmailPending).not.toHaveBeenCalled();
    expect(mockClearConfirmationEmailPending).toHaveBeenCalledWith(
      payload.reservationId,
    );
  });

  test("内部エラーは logError に吸収して再 throw しない", async () => {
    mockIssueSmartLockPasscodes.mockImplementation(async () => {
      throw new Error("switchbot down");
    });

    await expect(
      applyConfirmationSideEffects({
        payload,
        spaceId: SPACE_ID,
        channel: "customer",
      }),
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockSendReservationConfirmationEmail).not.toHaveBeenCalled();
  });
});
