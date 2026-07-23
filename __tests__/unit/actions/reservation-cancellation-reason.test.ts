import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockUpdateReservationStatusCommand = mock();
const mockApplyCancellationSideEffects = mock(async () => undefined);
const mockGetReservationStatus = mock();

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));
mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("server-only", () => ({}));
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));
mock.module("@/shared/domain/reservations/lifecycle-commands", () => ({
  deleteReservationCommand: mock(),
  restoreReservationCommand: mock(),
  restoreReservationStatusCommand: mock(),
  updateReservationNotesCommand: mock(),
  updateReservationStatusCommand: (
    ...args: Parameters<typeof mockUpdateReservationStatusCommand>
  ) => mockUpdateReservationStatusCommand(...args),
}));
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: (
    ...args: Parameters<typeof mockApplyCancellationSideEffects>
  ) => mockApplyCancellationSideEffects(...args),
}));
mock.module("@/shared/domain/reservations/admin-queries", () => ({
  getReservationStatus: (
    ...args: Parameters<typeof mockGetReservationStatus>
  ) => mockGetReservationStatus(...args),
  getReservationGuestData: mock(),
}));
mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerFromGuestData: mock(),
}));
mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));
mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  syncReservationToCalendar: mock(async () => undefined),
  updateCalendarSync: mock(async () => undefined),
  deleteCalendarSync: mock(async () => ({ success: true })),
}));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationAdminNotification: mock(async () => undefined),
  sendReservationConfirmationEmail: mock(async () => undefined),
  sendReservationStatusChangedEmail: mock(async () => undefined),
}));
mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  issueSmartLockPasscodes: mock(async () => ({
    passcodes: [],
    issuanceFailed: false,
  })),
}));
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: mock(async () => undefined),
}));
mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => undefined),
}));
mock.module("@/admin/lib/audit", () => ({
  emitBulkAuditRecords: mock(() => undefined),
}));
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));
mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  safeFetch: async <T>(opts: { fetch: () => Promise<T>; fallback: T }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  criticalFetch: async <T>(opts: { fetch: () => Promise<T> }) => opts.fetch(),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

const { updateReservationStatus } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations");
const { bulkCancelReservations } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk");
const { ReservationStatus } =
  await import("@/shared/lib/validations/enums/prisma-types");

const RESERVATION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("updateReservationStatus: cancellation reason threading", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      options.afterSuccess?.(data);
      return data;
    });
  });

  test("reason 指定時、applyCancellationSideEffects の cancellationReason に渡る", async () => {
    mockUpdateReservationStatusCommand.mockResolvedValue({
      payload: {},
      previousStatus: ReservationStatus.CONFIRMED,
      googleCalendarEventId: null,
      spaceId: "space-1",
    });

    await updateReservationStatus(
      RESERVATION_ID,
      ReservationStatus.CANCELLED,
      "顧客都合キャンセル",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: "顧客都合キャンセル" }),
    );
  });

  test("reason 未指定時は null が渡る (既存挙動を維持)", async () => {
    mockUpdateReservationStatusCommand.mockResolvedValue({
      payload: {},
      previousStatus: ReservationStatus.CONFIRMED,
      googleCalendarEventId: null,
      spaceId: "space-1",
    });

    await updateReservationStatus(RESERVATION_ID, ReservationStatus.CANCELLED);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: null }),
    );
  });
});

describe("bulkCancelReservations: cancellation reason threading", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
    mockGetReservationStatus.mockReset();
    mockGetReservationStatus.mockResolvedValue({
      status: ReservationStatus.CONFIRMED,
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute({ id: "admin-1" }),
    );
  });

  test("reason を全 id に同一の cancellationReason として渡す", async () => {
    await bulkCancelReservations([RESERVATION_ID], "重複予約");

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: RESERVATION_ID,
        cancellationReason: "重複予約",
      }),
    );
  });

  test("reason 未指定時は null (既存挙動を維持)", async () => {
    await bulkCancelReservations([RESERVATION_ID]);

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: null }),
    );
  });

  test("500文字超の reason は VALIDATION エラーになる", async () => {
    const { isMutationError } = await import("@/shared/lib/mutation-result");
    const result = await bulkCancelReservations(
      [RESERVATION_ID],
      "a".repeat(501),
    );
    expect(isMutationError(result)).toBe(true);
  });
});
