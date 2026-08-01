import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SubmissionResult } from "@conform-to/react";
import { installEmailRenderContextMock } from "../../support/email-render-context-mock";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";

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
const EVENT_EMAIL_RENDER_CONTEXT = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Test Org", email: "org@example.com" },
} as const;
const mockGetEventEmailRenderContext = mock(() =>
  Promise.resolve(EVENT_EMAIL_RENDER_CONTEXT),
);
const mockResolveEventAdminNotificationDelivery = mock(() =>
  Promise.resolve({
    enabled: true,
    notificationEmails: ["admin@example.com"],
  }),
);
// createAdminProxyRegistration は assertAdminFeatureCreateAllowed("events") を呼ぶ
// （feature-modules clean-break の admin create gate）。
const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
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

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
  assertAdminFeatureCreateAllowed: mock(async () => undefined),
}));

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
  updateEventRegistrationCommand: mock(),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: (
    ...args: Parameters<typeof mockGetEventRegistrationDetailsForEmail>
  ) => mockGetEventRegistrationDetailsForEmail(...args),
}));

installEmailRenderContextMock({
  getEventEmailRenderContext: (
    ...args: Parameters<typeof mockGetEventEmailRenderContext>
  ) => mockGetEventEmailRenderContext(...args),
  resolveEventAdminNotificationDelivery: (
    ...args: Parameters<typeof mockResolveEventAdminNotificationDelivery>
  ) => mockResolveEventAdminNotificationDelivery(...args),
});

installEmailLibDispatchMock({
  sendEventRegistrationConfirmation: (
    ...args: Parameters<typeof mockSendEventRegistrationConfirmation>
  ) => mockSendEventRegistrationConfirmation(...args),
  sendEventAdminNotification: (
    ...args: Parameters<typeof mockSendEventAdminNotification>
  ) => mockSendEventAdminNotification(...args),
});

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

/**
 * action は conform の Server Action になったので FormData で呼ぶ。
 * `quantity` も FormData 上は文字列（schema 側が `z.coerce.number()` で受ける）。
 */
const VALID = {
  name: "山田花子",
  email: "hanako@example.com",
  phone: "090-1234-5678",
  note: "電話で申込",
  quantity: 2,
} as const;

function validInput(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("eventId", eventId);
  formData.set("slotId", slotId);
  formData.set("ticketId", ticketId);
  formData.set("name", VALID.name);
  formData.set("email", VALID.email);
  formData.set("phone", VALID.phone);
  formData.set("note", VALID.note);
  formData.set("quantity", String(VALID.quantity));
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

/** Zod の field error は `submission.reply()` が field 名のキーに載せる */
function hasFieldError(result: SubmissionResult, field: string): boolean {
  return (result.error?.[field]?.length ?? 0) > 0;
}

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
    mockGetEventEmailRenderContext.mockReset();
    mockGetEventEmailRenderContext.mockResolvedValue(
      EVENT_EMAIL_RENDER_CONTEXT,
    );
    mockResolveEventAdminNotificationDelivery.mockReset();
    mockResolveEventAdminNotificationDelivery.mockResolvedValue({
      enabled: true,
      notificationEmails: ["admin@example.com"],
    });
    mockIsFeatureEnabled.mockReset();
    mockIsFeatureEnabled.mockResolvedValue(true);
    firedPromises.length = 0;
  });

  test("空の email は VALIDATION で弾かれる（walk-in と対比: 事前登録は必須）", async () => {
    const result = await createAdminProxyRegistration(
      undefined,
      validInput({ email: "" }),
    );

    expect(hasFieldError(result, "email")).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("不正な email 形式は VALIDATION で弾かれる", async () => {
    const result = await createAdminProxyRegistration(
      undefined,
      validInput({ email: "not-an-email" }),
    );

    expect(result.status).toBe("error");
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("空の name は VALIDATION で弾かれる", async () => {
    const result = await createAdminProxyRegistration(
      undefined,
      validInput({ name: "" }),
    );

    expect(result.status).toBe("error");
    expect(mockCreateAdminProxyRegistrationCommand).not.toHaveBeenCalled();
  });

  test("quantity 0 は VALIDATION で弾かれる（境界値）", async () => {
    const result = await createAdminProxyRegistration(
      undefined,
      validInput({ quantity: "0" }),
    );

    expect(result.status).toBe("error");
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
        name: VALID.name,
        email: VALID.email,
        quantity: VALID.quantity,
        icsSequence: 0,
      },
      event: { title: "テストイベント", slug: "test-event" },
    });

    const result = await createAdminProxyRegistration(undefined, validInput());

    expect(result.initialValue).toBeNull();
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
        name: VALID.name,
        email: VALID.email,
        phone: VALID.phone,
        note: VALID.note,
        quantity: VALID.quantity,
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
        name: VALID.name,
        email: VALID.email,
        quantity: VALID.quantity,
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

    const result = await createAdminProxyRegistration(undefined, validInput());
    // afterSuccess 内の fireAndForget 経由で積まれた副作用 Promise を待つ
    await Promise.allSettled(firedPromises);

    expect(result.initialValue).toBeNull();

    // 公開側の残枠表示に影響するため EVENTS キャッシュを無効化
    expect(mockInvalidateEventCaches).toHaveBeenCalled();

    // 確認メール送信
    expect(mockSendEventRegistrationConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        customerName: VALID.name,
        customerEmail: VALID.email,
        eventTitle: "テストイベント",
        quantity: VALID.quantity,
        icsSequence: 3,
        customerId: null,
      }),
      EVENT_EMAIL_RENDER_CONTEXT,
    );

    // admin 通知送信
    expect(mockSendEventAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        eventId,
        participantName: VALID.name,
        participantEmail: VALID.email,
        eventTitle: "テストイベント",
        quantity: VALID.quantity,
        currentRegistrations: 5,
        capacity: 20,
      }),
      "registration",
      expect.objectContaining({
        notificationEmails: ["admin@example.com"],
      }),
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
        name: VALID.name,
        email: VALID.email,
        quantity: 1,
        icsSequence: 0,
      },
      event: { title: "テストイベント", slug: "test-event" },
    });

    await createAdminProxyRegistration(
      undefined,
      validInput({
        name: "テスト太郎",
        email: "test@example.com",
        quantity: "1",
        phone: "",
        note: "",
      }),
    );

    expect(mockCreateAdminProxyRegistrationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: null,
        note: null,
      }),
    );
  });
});
