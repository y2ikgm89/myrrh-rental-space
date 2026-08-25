/**
 * applyEventRegistrationSelfServeUpdateSideEffects の audit 書込が
 * 変更フィールド名だけを残し、顧客 PII 値を oldValue/newValue に載せないことを検証する。
 *
 * Prisma / メール / 通知は差し替え、createAuditLogRecord のシグネチャだけを見る。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../../../support/email-lib-dispatch-mock";
import { installEmailRenderContextMock } from "../../../../support/email-render-context-mock";

installEmailLibDispatchMock();
installEmailRenderContextMock();

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: mock(() =>
    Promise.resolve(new Headers({ "user-agent": "test-ua" })),
  ),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("test-ip")),
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

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
  logError: mock(() => undefined),
  normalizeError: mock((error: unknown) => error),
}));

const { applyEventRegistrationSelfServeUpdateSideEffects } =
  await import("@/shared/domain/events/registration-update-side-effects");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const REGISTRATION_ID = "5b14871f-398c-400b-8fae-8c4df8dbccf6";

describe("applyEventRegistrationSelfServeUpdateSideEffects の AuditLog", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("変更フィールド名のみを newValue に記録する (旧値・新値の PII は含めない)", async () => {
    await applyEventRegistrationSelfServeUpdateSideEffects({
      registrationId: REGISTRATION_ID,
      eventId: "event-001",
      customerId: "customer-001",
      channel: "customer-mypage",
      actorUserId: "user-001",
      payload: {
        registrationId: REGISTRATION_ID,
        updatedAt: new Date("2026-08-25T00:00:00.000Z"),
        previous: {
          name: "旧太郎",
          email: "old@example.com",
          phone: "090-0000-0000",
          note: "旧メモ",
          quantity: 1,
        },
      },
      emailContext: {
        eventTitle: "Test Event",
        eventStartTime: new Date("2027-01-01T10:00:00Z"),
        eventEndTime: new Date("2027-01-01T12:00:00Z"),
        ticketName: "一般",
        ticketUnitPrice: 1000,
        ticketUnitSize: 1,
      },
      newValues: {
        name: "新太郎",
        email: "new@example.com",
        phone: "090-1111-1111",
        note: "新メモ",
        quantity: 2,
      },
    });
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("event-registration");
    expect(call["resourceId"]).toBe(REGISTRATION_ID);
    expect(call["oldValue"]).toBeUndefined();
    expect(call["newValue"]).toEqual({
      changedFields: ["email", "name", "note", "phone", "quantity"],
    });
    expect(JSON.stringify(call["newValue"])).not.toContain("新太郎");
  });
});
