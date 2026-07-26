/**
 * applyConfirmationSideEffects（確定後 smart-lock + 確認メール）の単体テスト。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../../mocks/errors-server";

mock.module("server-only", () => ({}));

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

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: mockSendReservationConfirmationEmail,
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
    mockIssueSmartLockPasscodes.mockImplementation(async () => ({
      passcodes: [],
      issuanceFailed: false,
    }));
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
