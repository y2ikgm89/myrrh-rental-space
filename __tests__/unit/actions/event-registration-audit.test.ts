/**
 * event-registration.ts の updateEventRegistration が customer-audit-diff.test.ts と
 * 同型の afterSuccess + createAuditLogRecord パターンで、resource "event-registration"
 * として oldValue/newValue を AuditLog に残すことを検証する。
 *
 * executeAdminMutationResult は薄いモックに差し替え、RBAC/cache invalidationは検証しない。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";
import { installEmailRenderContextMock } from "../../support/email-render-context-mock";

installEmailLibDispatchMock();
installEmailRenderContextMock();

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };
let currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
    afterSuccess?: (data: T) => void;
  }): Promise<T> => {
    const data = await options.execute(currentUser);
    options.afterSuccess?.(data);
    return data;
  },
}));

const mockUpdateEventRegistrationCommand = mock<
  () => Promise<{
    previous: {
      name: string;
      email: string | null;
      phone: string | null;
      note: string | null;
      quantity: number;
    };
  }>
>(() =>
  Promise.resolve({
    previous: {
      name: "旧太郎",
      email: "old@example.com",
      phone: "090-0000-0000",
      note: "旧メモ",
      quantity: 1,
    },
  }),
);

mock.module("@/shared/domain/events/registration-commands", () => ({
  adminCancelEventRegistrationCommand: mock(async () => ({})),
  createAdminProxyRegistrationCommand: mock(async () => ({})),
  createWalkInRegistrationCommand: mock(async () => ({})),
  setEventRegistrationCheckInCommand: mock(async () => ({})),
  updateEventRegistrationCommand: (
    ...args: Parameters<typeof mockUpdateEventRegistrationCommand>
  ) => mockUpdateEventRegistrationCommand(...args),
}));

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

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(async () => ({})),
  }),
);

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: "test-ip", userAgent: "test-ua" }),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  logError: mock(async () => undefined),
  createErrorLogger: mock(() => mock(async () => undefined)),
  normalizeError: mock((e) => e),
  getErrorMessage: mock((_e) => "error"),
  ReservationOverlapError: class {},
  isReservationOverlapError: mock(() => false),
  parseCloudTraceContext: mock(() => ({})),
  safeFetch: mock(async () => ({ ok: true })),
  criticalFetch: mock(async () => ({ ok: true })),
}));

const { updateEventRegistration } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event-registration");

const REGISTRATION_ID = "5b14871f-398c-400b-8fae-8c4df8dbccf6";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateEventRegistration の AuditLog diff (event-registration)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateEventRegistrationCommand.mockReset();
    mockUpdateEventRegistrationCommand.mockResolvedValue({
      previous: {
        name: "旧太郎",
        email: "old@example.com",
        phone: "090-0000-0000",
        note: "旧メモ",
        quantity: 1,
      },
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("変更前後を oldValue/newValue に記録する", async () => {
    const result = await updateEventRegistration({
      registrationId: REGISTRATION_ID,
      name: "新太郎",
      email: "new@example.com",
      phone: "090-1111-1111",
      note: "新メモ",
      quantity: 2,
    });

    expect(result).not.toHaveProperty("error");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("event-registration");
    expect(call["resourceId"]).toBe(REGISTRATION_ID);
    expect(call["oldValue"]).toEqual({
      name: "旧太郎",
      email: "old@example.com",
      phone: "090-0000-0000",
      note: "旧メモ",
      quantity: 1,
    });
    expect(call["newValue"]).toEqual({
      name: "新太郎",
      email: "new@example.com",
      phone: "090-1111-1111",
      note: "新メモ",
      quantity: 2,
    });
  });

  test("不正な registrationId は VALIDATION エラーを返し、監査ログは記録しない", async () => {
    const result = await updateEventRegistration({
      registrationId: "",
      name: "新太郎",
      email: undefined,
      phone: undefined,
      note: undefined,
      quantity: 1,
    });

    expect(result).toHaveProperty("error");
    await flushMicrotasks();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
