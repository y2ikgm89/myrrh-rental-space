import { beforeEach, describe, expect, mock, test } from "bun:test";
import { isMutationError } from "@/shared/lib/mutation-result";

const mockExecuteAdminMutationResult = mock();
const mockCreateAdminProxyRegistrationCommand = mock();
const mockGetEventRegistrationDetailsForEmail = mock();
const mockSendEventRegistrationConfirmation = mock(
  async () => ({ ok: true }) as const,
);
const mockSendEventAdminNotification = mock(
  async () => ({ ok: true }) as const,
);
const mockCreateNotificationCommand = mock(async () => undefined);
const mockInvalidateEventCaches = mock(() => undefined);

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
  adminCancelEventRegistrationCommand: mock(),
  createAdminProxyRegistrationCommand: (
    ...args: Parameters<typeof mockCreateAdminProxyRegistrationCommand>
  ) => mockCreateAdminProxyRegistrationCommand(...args),
  createWalkInRegistrationCommand: mock(),
  setEventRegistrationCheckInCommand: mock(),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: (
    ...args: Parameters<typeof mockGetEventRegistrationDetailsForEmail>
  ) => mockGetEventRegistrationDetailsForEmail(...args),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationConfirmation: (
    ...args: Parameters<typeof mockSendEventRegistrationConfirmation>
  ) => mockSendEventRegistrationConfirmation(...args),
  sendEventAdminNotification: (
    ...args: Parameters<typeof mockSendEventAdminNotification>
  ) => mockSendEventAdminNotification(...args),
  // 他の action / side-effect が同じ event-emails module から transitively import
  // する関数群も mock 化しないと ESM の named export 解決で SyntaxError になる。
  sendEventRegistrationCancelled: mock(async () => ({ ok: true }) as const),
  sendEventReminderEmail: mock(async () => ({ ok: true }) as const),
  sendEventCancelledToAllParticipants: mock(async () => undefined),
  sendEventUpdatedToAllParticipants: mock(async () => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (
    ...args: Parameters<typeof mockCreateNotificationCommand>
  ) => mockCreateNotificationCommand(...args),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: (
    ...args: Parameters<typeof mockInvalidateEventCaches>
  ) => mockInvalidateEventCaches(...args),
}));

// fireAndForget は本来 await しない設計だが、テストでは afterSuccess 内で発火された
// 副作用 Promise を捕まえて明示的に await できるよう、実行開始済みの Promise を
// 配列に積むだけの stub に差し替える（admin-event-registration.test.ts と同型）。
const firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

// mock.module 宣言後に動的 import する（testing-unit.md）
const { createAdminProxyRegistration } =
  await import("@/admin/actions/event-registration");

const eventId = "cm0event1234567890123456";
const slotId = "cm0slot1234567890123456ab"; // cuid2 (25 chars)
const ticketId = "cm0ticket1234567890123456";
const registrationId = "cm0reg12345678901234567";

const validInput = {
  eventId,
  slotId,
  ticketId,
  name: "山田花子",
  email: "hanako@example.com",
  phone: "090-1234-5678",
  note: "電話で申込",
  quantity: 2,
} as const;

describe("createAdminProxyRegistration (admin proxy registration action)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockCreateAdminProxyRegistrationCommand.mockReset();
    mockGetEventRegistrationDetailsForEmail.mockReset();
    mockSendEventRegistrationConfirmation.mockReset();
    mockSendEventRegistrationConfirmation.mockResolvedValue({ ok: true });
    mockSendEventAdminNotification.mockReset();
    mockSendEventAdminNotification.mockResolvedValue({ ok: true });
    mockCreateNotificationCommand.mockReset();
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockInvalidateEventCaches.mockReset();
    firedPromises.length = 0;
  });

  test("空の email は VALIDATION で弾かれる（walk-in と対比: 事前登録は必須）", async () => {
    const result = await createAdminProxyRegistration({
      ...validInput,
      email: "",
    });

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("VALIDATION");
    }
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("不正な email 形式は VALIDATION で弾かれる", async () => {
    const result = await createAdminProxyRegistration({
      ...validInput,
      email: "not-an-email",
    });

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("VALIDATION");
    }
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("空の name は VALIDATION で弾かれる", async () => {
    const result = await createAdminProxyRegistration({
      ...validInput,
      name: "",
    });

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("VALIDATION");
    }
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("quantity 0 は VALIDATION で弾かれる（境界値）", async () => {
    const result = await createAdminProxyRegistration({
      ...validInput,
      quantity: 0,
    });

    expect(isMutationError(result)).toBe(true);
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("resource:event / action:update / resourceId=eventId で管理 mutation を呼ぶ", async () => {
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute(),
    );
    mockCreateAdminProxyRegistrationCommand.mockResolvedValue({
      registration: {
        id: registrationId,
        eventId,
        slotId,
        ticketId,
        name: validInput.name,
        email: validInput.email,
        quantity: validInput.quantity,
        icsSequence: 0,
      },
      event: { title: "テストイベント", slug: "test-event" },
    });

    const result = await createAdminProxyRegistration(validInput);

    expect(isMutationError(result)).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "update",
        resourceId: eventId,
      }),
    );
    expect(mockCreateAdminProxyRegistrationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        slotId,
        ticketId,
        name: validInput.name,
        email: validInput.email,
        phone: validInput.phone,
        note: validInput.note,
        quantity: validInput.quantity,
      }),
    );
  });

  test("afterSuccess は確認メール + admin 通知メールを fire-and-forget で送信する", async () => {
    mockCreateAdminProxyRegistrationCommand.mockResolvedValue({
      registration: {
        id: registrationId,
        eventId,
        slotId,
        ticketId,
        name: validInput.name,
        email: validInput.email,
        quantity: validInput.quantity,
        icsSequence: 3,
      },
      event: { title: "テストイベント", slug: "test-event" },
    });
    mockGetEventRegistrationDetailsForEmail.mockResolvedValue({
      eventTitle: "テストイベント",
      startTime: new Date("2026-08-01T10:00:00.000Z"),
      endTime: new Date("2026-08-01T12:00:00.000Z"),
      location: "テスト会場",
      capacity: 20,
      confirmedCount: 5,
      format: "OFFLINE",
      meetingUrl: null,
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await createAdminProxyRegistration(validInput);
    // afterSuccess 内の fireAndForget 経由で積まれた副作用 Promise を待つ
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);

    // 公開側の残枠表示に影響するため EVENTS キャッシュを無効化
    expect(mockInvalidateEventCaches).toHaveBeenCalled();

    // 確認メール送信
    expect(mockSendEventRegistrationConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        customerName: validInput.name,
        customerEmail: validInput.email,
        eventTitle: "テストイベント",
        quantity: validInput.quantity,
        icsSequence: 3,
        customerId: null,
      }),
    );

    // admin 通知送信
    expect(mockSendEventAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        eventId,
        participantName: validInput.name,
        participantEmail: validInput.email,
        eventTitle: "テストイベント",
        quantity: validInput.quantity,
        currentRegistrations: 5,
        capacity: 20,
      }),
      "registration",
    );

    // 通知 (in-app notification) も fire-and-forget
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event_registration",
        resourceType: "event",
      }),
    );
  });

  test("phone / note 未指定は null に変換されて command へ渡る", async () => {
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute(),
    );
    mockCreateAdminProxyRegistrationCommand.mockResolvedValue({
      registration: {
        id: registrationId,
        eventId,
        slotId,
        ticketId,
        name: validInput.name,
        email: validInput.email,
        quantity: 1,
        icsSequence: 0,
      },
      event: { title: "テストイベント", slug: "test-event" },
    });

    await createAdminProxyRegistration({
      eventId,
      slotId,
      ticketId,
      name: "テスト太郎",
      email: "test@example.com",
      quantity: 1,
    });

    expect(mockCreateAdminProxyRegistrationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: null,
        note: null,
      }),
    );
  });
});
