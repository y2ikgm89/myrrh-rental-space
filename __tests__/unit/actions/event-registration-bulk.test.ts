/**
 * bulkCancelEventRegistrations / bulkCheckInEventRegistrations の per-id 副作用を検証する。
 * reservation/bulk.ts の bulkCancelReservations と同型のテストパターン。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };
let currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
  }): Promise<T> => options.execute(currentUser),
}));

const mockAdminCancelCommand = mock<
  (registrationId: string) => Promise<{ eventId: string }>
>(() => Promise.resolve({ eventId: "event-1" }));
const mockCheckInCommand = mock<
  (registrationId: string, attended: boolean) => Promise<{ eventId: string }>
>(() => Promise.resolve({ eventId: "event-1" }));

mock.module("@/shared/domain/events/registration-commands", () => ({
  adminCancelEventRegistrationCommand: (
    ...args: Parameters<typeof mockAdminCancelCommand>
  ) => mockAdminCancelCommand(...args),
  createAdminProxyRegistrationCommand: mock(async () => ({})),
  createWalkInRegistrationCommand: mock(async () => ({})),
  setEventRegistrationCheckInCommand: (
    ...args: Parameters<typeof mockCheckInCommand>
  ) => mockCheckInCommand(...args),
  updateEventRegistrationCommand: mock(async () => ({ previous: {} })),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(async () => ({})),
  }),
);

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventAdminNotification: mock(async () => undefined),
  sendEventRegistrationConfirmation: mock(async () => undefined),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(async () => null),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundEventRegistrationPaymentCommand: mock(async () => ({})),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
}));

const { bulkCancelEventRegistrations, bulkCheckInEventRegistrations } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event-registration");
const { isMutationError } = await import("@/shared/lib/mutation-result");

describe("bulkCancelEventRegistrations", () => {
  beforeEach(() => {
    mockAdminCancelCommand.mockReset();
    mockAdminCancelCommand.mockResolvedValue({ eventId: "event-1" });
  });

  test("全件成功時は succeeded が ids.length と一致する", async () => {
    const result = await bulkCancelEventRegistrations(["r1", "r2", "r3"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(mockAdminCancelCommand).toHaveBeenCalledTimes(3);
  });

  test("一部が例外を投げても残りは処理され failed に計上される", async () => {
    mockAdminCancelCommand
      .mockResolvedValueOnce({ eventId: "event-1" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ eventId: "event-1" });

    const result = await bulkCancelEventRegistrations(["r1", "r2", "r3"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });

  test("空配列は VALIDATION エラーを返す", async () => {
    const result = await bulkCancelEventRegistrations([]);
    expect(isMutationError(result)).toBe(true);
  });
});

describe("bulkCheckInEventRegistrations", () => {
  beforeEach(() => {
    mockCheckInCommand.mockReset();
    mockCheckInCommand.mockResolvedValue({ eventId: "event-1" });
  });

  test("全件成功時は succeeded が ids.length と一致する", async () => {
    const result = await bulkCheckInEventRegistrations(["r1", "r2"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(2);
    expect(mockCheckInCommand).toHaveBeenCalledWith("r1", true);
    expect(mockCheckInCommand).toHaveBeenCalledWith("r2", true);
  });
});
