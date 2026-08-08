/**
 * bulkCancelEventRegistrations / bulkCheckInEventRegistrations の per-id 副作用を検証する。
 * reservation/bulk.ts の bulkCancelReservations と同型のテストパターン。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";
import { installEmailRenderContextMock } from "../../support/email-render-context-mock";

installEmailLibDispatchMock();
installEmailRenderContextMock();

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };
const currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
  }): Promise<T> => options.execute(currentUser),
}));

const mockAdminCancelCommand = mock<
  (registrationId: string) => Promise<{ eventId: string }>
>(() => Promise.resolve({ eventId: "event-1" }));
const mockCheckInCommand = mock<
  (params: {
    eventId: string;
    registrationId: string;
    attended: boolean;
  }) => Promise<{ eventId: string }>
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

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(async () => null),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundEventRegistrationPaymentCommand: mock(async () => ({})),
  recordManualEventPaymentCommand: mock(async () => ({ registrationId: "x" })),
  createEventCheckoutSessionCommand: mock(async () => ({
    checkoutUrl: "https://stripe.test/checkout",
  })),
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

const { bulkCancelEventRegistrations, bulkCheckInEventRegistrations } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event-registration");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// uuid 形式のテスト ID（z.uuid() は形式を強制するため "r1" 等は不可）
const REGISTRATION_ID_1 = "5b14871f-398c-400b-8fae-8c4df8dbccf6";
const REGISTRATION_ID_2 = "00a5f2a2-8b62-407e-8b15-27a180a3e45f";
const REGISTRATION_ID_3 = "c4ba2e81-ed7f-4417-804d-46f9ea05e353";
const EVENT_ID = "ddbe9246-50e0-41e5-8318-e6be50a312c9";

describe("bulkCancelEventRegistrations", () => {
  beforeEach(() => {
    mockAdminCancelCommand.mockReset();
    mockAdminCancelCommand.mockResolvedValue({ eventId: "event-1" });
  });

  test("全件成功時は succeeded が ids.length と一致する", async () => {
    const result = await bulkCancelEventRegistrations([
      REGISTRATION_ID_1,
      REGISTRATION_ID_2,
      REGISTRATION_ID_3,
    ]);
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

    const result = await bulkCancelEventRegistrations([
      REGISTRATION_ID_1,
      REGISTRATION_ID_2,
      REGISTRATION_ID_3,
    ]);
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
    const result = await bulkCheckInEventRegistrations(EVENT_ID, [
      REGISTRATION_ID_1,
      REGISTRATION_ID_2,
    ]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(2);
    expect(mockCheckInCommand).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID_1,
      attended: true,
    });
    expect(mockCheckInCommand).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID_2,
      attended: true,
    });
  });
});
