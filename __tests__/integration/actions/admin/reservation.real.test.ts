/**
 * Reservation Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts の
 * id-only mutation (updateReservationNotes / deleteReservation /
 * restoreReservation / restoreReservationStatus) を実 import で呼び出す。
 *
 * conform 系 (createReservationAction / updateReservationAction) は副作用が
 * 多い (メール・GCal・通知) ため後続タスクで分離 test 化。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockUpdateNotes = mock<
  (id: string, notes: string | null) => Promise<void>
>(() => Promise.resolve());
const mockDeleteReservation = mock(() =>
  Promise.resolve({
    googleCalendarEventId: null,
    customerId: "cust-id",
    couponId: null,
  }),
);
const mockRestoreReservation = mock(() =>
  Promise.resolve({ customerId: "cust-id", couponId: null }),
);
const mockUpdateStatus = mock(() =>
  Promise.resolve({
    previousStatus: "PENDING",
    googleCalendarEventId: null,
    customerId: "cust-id",
    couponId: null,
    payload: {
      reservationId: "r1",
      customerEmail: "c@e.com",
      customerName: "x",
      spaceName: "s",
      startTime: new Date(),
      endTime: new Date(),
      totalPrice: 0,
      icsSequence: 0,
    },
  }),
);
const mockRestoreStatus = mock(() =>
  Promise.resolve({
    previousStatus: "COMPLETED",
    targetStatus: "CONFIRMED",
    googleCalendarEventId: null,
    customerId: "c1",
    payload: {
      reservationId: "r1",
      customerEmail: "c@e.com",
      customerName: "x",
      spaceName: "s",
      startTime: new Date(),
      endTime: new Date(),
      totalPrice: 0,
      icsSequence: 0,
    },
  }),
);

mock.module("@/shared/domain/reservations/lifecycle-commands", () => ({
  deleteReservationCommand: mockDeleteReservation,
  restoreReservationCommand: mockRestoreReservation,
  restoreReservationStatusCommand: mockRestoreStatus,
  updateReservationNotesCommand: mockUpdateNotes,
  updateReservationStatusCommand: mockUpdateStatus,
}));

mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mock(async () => {}),
}));

mock.module("@/shared/domain/reservations/admin-queries", () => ({
  getReservationGuestData: mock(async () => null),
}));

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerFromGuestData: mock(async () => {}),
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => {}),
}));

mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  syncReservationToCalendar: mock(async () => {}),
  updateCalendarSync: mock(async () => {}),
  deleteCalendarSync: mock(async () => {}),
}));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationAdminNotification: mock(async () => {}),
  sendReservationConfirmationEmail: mock(async () => {}),
  sendReservationStatusChangedEmail: mock(async () => {}),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => {}),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(async () => null),
}));

mock.module("next/headers", () => ({
  headers: mock(async () => ({ get: () => null })),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "SUPER_ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const {
  updateReservationNotes,
  deleteReservation,
  restoreReservation,
  restoreReservationStatus,
  updateReservationStatus,
} =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("updateReservationNotes (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateNotes.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateReservationNotes("bad", "notes");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("正常系: resource=reservation, action=update", async () => {
    await updateReservationNotes(VALID_UUID, "メモ");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "reservation",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateNotes).toHaveBeenCalledWith(VALID_UUID, "メモ");
  });
});

describe("deleteReservation (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteReservation.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteReservation("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=reservation, action=delete", async () => {
    await deleteReservation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "reservation",
        action: "delete",
      }),
    );
    expect(mockDeleteReservation).toHaveBeenCalledWith(VALID_UUID, "admin");
  });
});

describe("restoreReservation (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockRestoreReservation.mockClear();
  });

  test("正常系: resource=reservation, action=update", async () => {
    await restoreReservation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "reservation",
        action: "update",
      }),
    );
  });
});

describe("restoreReservationStatus (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockRestoreStatus.mockClear();
  });

  test("正常系: 引数不正で validation error", async () => {
    const r = await restoreReservationStatus(
      "bad",
      "CONFIRMED" as unknown as never,
    );
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: SUPER_ADMIN で wrapper 経由 command 呼び出し", async () => {
    await restoreReservationStatus(VALID_UUID, "CONFIRMED" as unknown as never);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "reservation",
        action: "update",
      }),
    );
  });
});

describe("updateReservationStatus (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateStatus.mockClear();
  });

  test("正常系: status 変更を domain に伝搬", async () => {
    await updateReservationStatus(VALID_UUID, "CONFIRMED" as unknown as never);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "reservation",
        action: "update",
      }),
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(VALID_UUID, "CONFIRMED");
  });
});
