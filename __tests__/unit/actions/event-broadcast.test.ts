import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";

const mockExecuteAdminMutationResult = mock();
const mockSendEventBroadcast = mock();
const mockGetEventBroadcastPayload = mock();
const mockCheckActionRateLimit = mock();
const mockRateLimiterCheck = mock();

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

installEmailLibDispatchMock({
  sendEventBroadcast: (...args: Parameters<typeof mockSendEventBroadcast>) =>
    mockSendEventBroadcast(...args),
});

mock.module("@/shared/domain/events/email-queries", () => ({
  getEventBroadcastPayload: (
    ...args: Parameters<typeof mockGetEventBroadcastPayload>
  ) => mockGetEventBroadcastPayload(...args),
}));

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: (
    ...args: Parameters<typeof mockCheckActionRateLimit>
  ) => mockCheckActionRateLimit(...args),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  eventBroadcastRateLimiter: {
    check: (...args: Parameters<typeof mockRateLimiterCheck>) =>
      mockRateLimiterCheck(...args),
  },
}));

const { broadcastEventAction } =
  await import("@/admin/actions/event-broadcast");
const { isDomainError } = await import("@/shared/domain/domain-error");
const { eventBroadcastSchema } =
  await import("@/shared/lib/validations/event-broadcast");

/** valid uuid — schema does not accept random strings. */
const VALID_EVENT_ID = "0baaa247-7a6c-4938-893c-a0a9c382b12b";

function buildFormData(subject: string, body: string): FormData {
  const fd = new FormData();
  fd.set("subject", subject);
  fd.set("body", body);
  return fd;
}

describe("event-broadcast Zod schema", () => {
  test("subject の空文字は reject される", () => {
    const result = eventBroadcastSchema.safeParse({
      subject: "",
      body: "hello",
    });
    expect(result.success).toBe(false);
  });

  test("subject が 200 文字ちょうどは通り、201 文字は reject", () => {
    const boundary = "a".repeat(200);
    const over = "a".repeat(201);
    expect(
      eventBroadcastSchema.safeParse({ subject: boundary, body: "b" }).success,
    ).toBe(true);
    expect(
      eventBroadcastSchema.safeParse({ subject: over, body: "b" }).success,
    ).toBe(false);
  });

  test("body の空文字は reject される", () => {
    const result = eventBroadcastSchema.safeParse({
      subject: "hi",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  test("body が 5000 文字ちょうどは通り、5001 文字は reject", () => {
    const boundary = "a".repeat(5000);
    const over = "a".repeat(5001);
    expect(
      eventBroadcastSchema.safeParse({ subject: "s", body: boundary }).success,
    ).toBe(true);
    expect(
      eventBroadcastSchema.safeParse({ subject: "s", body: over }).success,
    ).toBe(false);
  });

  test("subject / body の前後空白は trim される", () => {
    const parsed = eventBroadcastSchema.parse({
      subject: "  hello  ",
      body: "  world  ",
    });
    expect(parsed.subject).toBe("hello");
    expect(parsed.body).toBe("world");
  });
});

describe("broadcastEventAction", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockSendEventBroadcast.mockReset();
    mockGetEventBroadcastPayload.mockReset();
    mockCheckActionRateLimit.mockReset();
    mockRateLimiterCheck.mockReset();

    mockGetEventBroadcastPayload.mockResolvedValue({
      eventId: VALID_EVENT_ID,
      title: "Test Event",
      slug: "test-event",
      recipients: [],
      skipped: 0,
      customerIdByEmail: new Map(),
    });

    // Default: rate limit passes.
    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockRateLimiterCheck.mockResolvedValue({
      success: true,
      remaining: 2,
      reset: Date.now() + 60_000,
    });
  });

  test("不正な eventId は Zod で reject し executeAdminMutationResult を呼ばない", async () => {
    const result = await broadcastEventAction(
      "not-a-uuid",
      undefined,
      buildFormData("s", "b"),
    );
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    // conform SubmissionResult
    expect(result).toMatchObject({ status: "error" });
  });

  test("rate limit 超過時も executeAdminMutationResult を呼ぶ", async () => {
    mockCheckActionRateLimit.mockResolvedValue({
      success: false,
      error: "リクエストが多すぎます。しばらく経ってから再度お試しください。",
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      try {
        return await options.execute();
      } catch (error) {
        if (isDomainError(error)) {
          return { error: error.message, code: error.code };
        }
        throw error;
      }
    });

    const result = await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("s", "b"),
    );
    expect(mockExecuteAdminMutationResult).toHaveBeenCalled();
    expect(mockSendEventBroadcast).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "error" });
  });

  test("権限拒否のときは rate limit を消費しない", async () => {
    mockExecuteAdminMutationResult.mockResolvedValue({
      error: "eventのupdate権限がありません",
    });

    const result = await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("s", "b"),
    );

    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
    expect(mockSendEventBroadcast).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "error" });
  });

  test("rate limit token は eventId ベース (IP でなく)", async () => {
    // rate limit passes but let's inspect the token via mockRateLimiterCheck
    mockCheckActionRateLimit.mockImplementation(async (limiter) => {
      // action wraps eventBroadcastRateLimiter.check(validId) inside a synthetic
      // check() so the token argument to checkActionRateLimit is a dummy IP.
      // The real rate-limiter call should have received the eventId.
      await limiter.check("ignored-token");
      return { success: true };
    });
    mockSendEventBroadcast.mockResolvedValue({ ok: true, sent: 0, skipped: 0 });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      return data;
    });

    await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("s", "b"),
    );

    expect(mockRateLimiterCheck).toHaveBeenCalledWith(VALID_EVENT_ID);
  });

  test("送信対象 0 でも sendEventBroadcast は呼ばれ、mutation は成功する", async () => {
    mockSendEventBroadcast.mockResolvedValue({ ok: true, sent: 0, skipped: 0 });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("件名", "本文"),
    );

    expect(mockSendEventBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: VALID_EVENT_ID }),
      expect.objectContaining({
        subject: "件名",
        body: "本文",
        broadcastNonce: expect.any(String),
      }),
    );
    // conform reply({resetForm: true}) → initialValue null
    expect(result).toMatchObject({ initialValue: null });
  });

  test("executeAdminMutationResult は resource: event / action: update / resourceId: eventId で呼ばれる", async () => {
    mockSendEventBroadcast.mockResolvedValue({ ok: true, sent: 3, skipped: 1 });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      return data;
    });

    await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("件名", "本文"),
    );

    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "update",
        resourceId: VALID_EVENT_ID,
      }),
    );
  });

  test("宛先があるのに 1 通も送れなかったら成功にしない (Resend 未設定)", async () => {
    mockGetEventBroadcastPayload.mockResolvedValue({
      eventId: VALID_EVENT_ID,
      title: "Test Event",
      slug: "test-event",
      recipients: [
        { id: "reg-1", email: "sato@example.com", customerId: "cus-1" },
      ],
      skipped: 0,
      customerIdByEmail: new Map(),
    });
    // lib-dispatch は transport 無効 (RESEND_API_KEY 未設定) で ok:false / sent:0 を返す
    mockSendEventBroadcast.mockResolvedValue({
      ok: false,
      sent: 0,
      skipped: 0,
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      try {
        return await options.execute();
      } catch (error) {
        if (isDomainError(error)) {
          return { error: error.message, code: error.code };
        }
        throw error;
      }
    });

    const result = await broadcastEventAction(
      VALID_EVENT_ID,
      undefined,
      buildFormData("件名", "本文"),
    );

    // reply({resetForm:true}) の成功 shape ({initialValue: null}) ではなく、
    // formErrors 付きの error shape が返る
    expect(result).toMatchObject({
      status: "error",
      error: {
        "": [
          "メール送信が無効です。連携設定（/admin/settings/integrations?tab=resend）で Resend API キーを設定するか、環境変数 RESEND_API_KEY を設定してください。",
        ],
      },
    });
  });
});
