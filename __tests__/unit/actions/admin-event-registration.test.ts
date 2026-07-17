import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockAdminCancelEventRegistrationCommand = mock();
const mockSetEventRegistrationCheckInCommand = mock();
const mockApplyEventRegistrationCancellationSideEffects = mock(
  async () => undefined,
);

mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

mock.module("server-only", () => ({}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));

mock.module("@/shared/domain/events/registration-commands", () => ({
  adminCancelEventRegistrationCommand: (
    ...args: Parameters<typeof mockAdminCancelEventRegistrationCommand>
  ) => mockAdminCancelEventRegistrationCommand(...args),
  createAdminProxyRegistrationCommand: mock(),
  createWalkInRegistrationCommand: mock(),
  setEventRegistrationCheckInCommand: (
    ...args: Parameters<typeof mockSetEventRegistrationCheckInCommand>
  ) => mockSetEventRegistrationCheckInCommand(...args),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: (
      ...args: Parameters<
        typeof mockApplyEventRegistrationCancellationSideEffects
      >
    ) => mockApplyEventRegistrationCancellationSideEffects(...args),
  }),
);

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

// fireAndForget は本来 await しない設計だが、テストでは afterSuccess 内で発火された
// 副作用 Promise を捕まえて明示的に await できるよう、実行開始済みの Promise を
// 配列に積むだけの stub に差し替える（next/server の after() 依存も排除する）。
const firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

const { adminCancelRegistration, toggleEventRegistrationCheckIn } =
  await import("@/admin/actions/event-registration");

describe("admin event registration actions", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockAdminCancelEventRegistrationCommand.mockReset();
    mockSetEventRegistrationCheckInCommand.mockReset();
    mockApplyEventRegistrationCancellationSideEffects.mockReset();
    mockApplyEventRegistrationCancellationSideEffects.mockResolvedValue(
      undefined,
    );
  });

  test("管理キャンセルは CUID の申込 ID を検証で落とさず管理 mutation に渡す", async () => {
    const registrationId = "cm0reg12345678901234567";

    mockExecuteAdminMutationResult.mockResolvedValue({
      registrationId,
      eventId: "cm0event1234567890123456",
      name: "佐藤花子",
      email: "sato@example.com",
      eventTitle: "イベント",
      quantity: 1,
      icsSequence: 1,
    });

    const result = await adminCancelRegistration(registrationId);

    expect("error" in result).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "update",
        resourceId: registrationId,
      }),
    );
  });

  test("管理キャンセルの afterSuccess は副作用モジュールを channel:admin で呼ぶ", async () => {
    const registrationId = "cm0reg12345678901234567";
    const eventId = "cm0event1234567890123456";

    mockAdminCancelEventRegistrationCommand.mockResolvedValue({
      id: registrationId,
      eventId,
      name: "佐藤花子",
      email: "sato@example.com",
      event: { title: "イベント" },
      quantity: 1,
      icsSequence: 1,
    });

    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      await options.afterSuccess?.(data);
      return data;
    });

    await adminCancelRegistration(registrationId);
    // afterSuccess 内の fireAndForget が発火した副作用 Promise の完了を待つ。
    await Promise.allSettled(firedPromises);

    expect(mockAdminCancelEventRegistrationCommand).toHaveBeenCalledWith(
      registrationId,
    );
    expect(
      mockApplyEventRegistrationCancellationSideEffects,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        channel: "admin",
        actorUserId: null,
      }),
    );
  });

  test("出席トグルは eventId と registrationId をドメインコマンドへ渡す", async () => {
    const eventId = "cm0event1234567890123456";
    const registrationId = "cm0reg12345678901234567";

    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute(),
    );
    mockSetEventRegistrationCheckInCommand.mockResolvedValue({
      registrationId,
      eventId,
      before: null,
      after: new Date("2026-07-01T00:00:00.000Z"),
      changed: true,
    });

    const result = await toggleEventRegistrationCheckIn({
      eventId,
      registrationId,
      attended: true,
    });

    expect("error" in result).toBe(false);
    expect(mockSetEventRegistrationCheckInCommand).toHaveBeenCalledWith({
      eventId,
      registrationId,
      attended: true,
    });
  });
});
