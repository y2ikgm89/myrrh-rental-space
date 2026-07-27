/**
 * createReservationAction — CONFIRMED 作成時の smart-lock 発行と sendEmail gate
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const START_TIME = new Date("2027-03-01T01:00:00.000Z");
const END_TIME = new Date("2027-03-01T03:00:00.000Z");

type CreateInput = {
  mode: "existing";
  customerId: string;
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  sendEmail: boolean;
};

const baseInput: CreateInput = {
  mode: "existing",
  customerId: "33333333-3333-4333-8333-333333333333",
  spaceId: SPACE_ID,
  date: "2027-03-01",
  startTime: "10:00",
  endTime: "12:00",
  status: ReservationStatus.CONFIRMED,
  sendEmail: false,
};

const mutationPayload = {
  id: VALID_UUID,
  customerId: baseInput.customerId,
  payload: {
    reservationId: VALID_UUID,
    customerEmail: "guest@example.com",
    customerName: "Guest User",
    spaceName: "Test Space",
    startTime: START_TIME,
    endTime: END_TIME,
    totalPrice: 5000,
    icsSequence: 0,
  },
};

const mockCreateAdminReservationCommand = mock(async () => mutationPayload);
const mockIssueSmartLockPasscodes = mock(async () => ({
  passcodes: [],
  issuanceFailed: false,
}));
const mockApplyConfirmationSideEffects = mock(async () => {});
const mockSendReservationConfirmationEmail = mock(async () => {});
const mockSendReservationAdminNotification = mock(async () => {});
const mockSyncReservationToCalendar = mock(async () => {});
const mockCreateNotificationCommand = mock(async () => {});

const fireAndForgetCalls: Array<{ operation: string }> = [];

mock.module("@/shared/domain/reservations/admin-commands", () => ({
  createAdminReservationCommand: mockCreateAdminReservationCommand,
  updateAdminReservationCommand: mock(async () => {
    throw new Error("unexpected update");
  }),
}));

mock.module("@/shared/domain/reservations/pricing-preview", () => ({
  previewReservationPricing: mock(async () => null),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
  markAsReadCommand: mock(async () => {}),
  markAllAsReadCommand: mock(async () => {}),
  deleteNotificationCommand: mock(async () => {}),
  hasRecentNotificationOfType: mock(async () => false),
  deleteOldNotificationsCommand: mock(async () => 0),
}));

mock.module("@/shared/domain/reservations/edit-side-effects", () => ({
  applyReservationEditSideEffects: mock(async () => ({
    passcodes: [],
    issuanceFailed: false,
  })),
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: mock(async () => {}),
}));

mock.module("@/shared/domain/features/check", () => ({
  assertAdminFeatureCreateAllowed: mock(async () => {}),
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => {}),
}));

mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  syncReservationToCalendar: mockSyncReservationToCalendar,
  updateCalendarSync: mock(async () => {}),
  deleteCalendarSync: mock(async () => {}),
}));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationAdminNotification: mockSendReservationAdminNotification,
  sendReservationConfirmationEmail: mockSendReservationConfirmationEmail,
  sendReservationStatusChangedEmail: mock(async () => {}),
  sendReservationUpdatedEmail: mock(async () => {}),
  sendBulkReservationCancelledEmail: mock(async () => ({
    ok: false,
    reason: "disabled",
  })),
  sendBulkAdminNotification: mock(async () => ({
    ok: false,
    reason: "disabled",
  })),
}));

mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  issueSmartLockPasscodes: mockIssueSmartLockPasscodes,
}));

mock.module("@/shared/domain/reservations/confirmation-side-effects", () => ({
  applyConfirmationSideEffects: mockApplyConfirmationSideEffects,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(
    (_promise: Promise<unknown>, options: { operation: string }) => {
      fireAndForgetCalls.push({ operation: options.operation });
    },
  ),
}));

mock.module("next/navigation", () => ({
  redirect: mock(() => {
    throw new Error("REDIRECT");
  }),
}));

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: mock(
    async (
      _formData: FormData,
      _schema: unknown,
      handler: (input: CreateInput) => Promise<{ ok: boolean; error?: string }>,
    ) => {
      return handler(baseInput);
    },
  ),
}));

type ExecuteOpts<T> = {
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecute = mock(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "SUPER_ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { createReservationAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin");

function setInput(overrides: Partial<CreateInput>) {
  Object.assign(baseInput, overrides);
}

describe("createReservationAction — smart-lock on CONFIRMED create", () => {
  beforeEach(() => {
    fireAndForgetCalls.length = 0;
    mockExecute.mockClear();
    mockCreateAdminReservationCommand.mockClear();
    mockIssueSmartLockPasscodes.mockClear();
    mockApplyConfirmationSideEffects.mockClear();
    mockSendReservationConfirmationEmail.mockClear();
    mockSendReservationAdminNotification.mockClear();
    mockSyncReservationToCalendar.mockClear();

    setInput({
      status: ReservationStatus.CONFIRMED,
      sendEmail: false,
    });
  });

  test("sendEmail=false でも CONFIRMED 作成時は passcode 発行をスケジュールする", async () => {
    await expect(
      createReservationAction(undefined, new FormData()),
    ).rejects.toThrow("REDIRECT");

    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation ===
          "createReservationActionApplyConfirmationSideEffects",
      ),
    ).toBe(true);
    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation === "createReservationActionSendConfirmationEmails",
      ),
    ).toBe(false);
    expect(
      fireAndForgetCalls.some(
        (call) => call.operation === "syncReservationToCalendar",
      ),
    ).toBe(true);
  });

  test("sendEmail=true + CONFIRMED は confirmation helper 経由で発行+メール", async () => {
    setInput({ sendEmail: true });

    await expect(
      createReservationAction(undefined, new FormData()),
    ).rejects.toThrow("REDIRECT");

    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation ===
          "createReservationActionApplyConfirmationSideEffects",
      ),
    ).toBe(true);
    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation === "createReservationActionAdminNotificationConfirm",
      ),
    ).toBe(true);
  });

  test("sendEmail=false + PENDING は passcode 発行も confirmation メールもスケジュールしない", async () => {
    setInput({ status: ReservationStatus.PENDING, sendEmail: false });

    await expect(
      createReservationAction(undefined, new FormData()),
    ).rejects.toThrow("REDIRECT");

    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation ===
          "createReservationActionApplyConfirmationSideEffects",
      ),
    ).toBe(false);
    expect(
      fireAndForgetCalls.some(
        (call) =>
          call.operation === "createReservationActionSendConfirmationEmails",
      ),
    ).toBe(false);
    expect(
      fireAndForgetCalls.some(
        (call) => call.operation === "syncReservationToCalendar",
      ),
    ).toBe(true);
  });
});
