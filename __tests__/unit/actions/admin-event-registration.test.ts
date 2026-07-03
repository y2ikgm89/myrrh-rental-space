import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockCancelEventRegistrationCommand = mock();
const mockSetEventRegistrationCheckInCommand = mock();

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

mock.module("@/shared/domain/events/registration-commands", () => ({
  cancelEventRegistrationCommand: (
    ...args: Parameters<typeof mockCancelEventRegistrationCommand>
  ) => mockCancelEventRegistrationCommand(...args),
  createWalkInRegistrationCommand: mock(),
  setEventRegistrationCheckInCommand: (
    ...args: Parameters<typeof mockSetEventRegistrationCheckInCommand>
  ) => mockSetEventRegistrationCheckInCommand(...args),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(async () => null),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationCancelled: mock(async () => undefined),
  sendEventAdminNotification: mock(async () => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

const { adminCancelRegistration, toggleEventRegistrationCheckIn } =
  await import("@/admin/actions/event-registration");

describe("admin event registration actions", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockCancelEventRegistrationCommand.mockReset();
    mockSetEventRegistrationCheckInCommand.mockReset();
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
