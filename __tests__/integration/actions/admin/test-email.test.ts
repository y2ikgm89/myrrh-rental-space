import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockSendTestEmail = mock<
  (
    params: unknown,
  ) => Promise<
    | { ok: true; messageId: string }
    | { ok: false; reason: "disabled" }
    | { ok: false; reason: "error"; error: string }
  >
>(() => Promise.resolve({ ok: true, messageId: "re_default" }));

mock.module("@/shared/lib/email/test-email", () => ({
  sendTestEmail: mockSendTestEmail,
}));

const mockValidateSenderDomain = mock<
  (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; verifiedDomains: string[] }>
>(() => Promise.resolve({ ok: true }));

mock.module("@/shared/lib/email/domain-verification", () => ({
  validateSenderDomain: mockValidateSenderDomain,
}));

const mockGetEmailDeliverySettings = mock(() =>
  Promise.resolve({
    senderEmail: "from@verified.com",
    senderName: "Site",
    replyToEmail: null,
  }),
);

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
}));

const mockGetSeoSettings = mock(() => Promise.resolve({ siteName: "Myrrh" }));

mock.module("@/shared/domain/settings/queries/site", () => ({
  getSeoSettings: mockGetSeoSettings,
}));

const mockRateLimitCheck = mock<
  (
    ip: string,
  ) => Promise<{ success: boolean; remaining: number; reset: number }>
>(() =>
  Promise.resolve({ success: true, remaining: 19, reset: Date.now() + 900000 }),
);

mock.module("@/shared/lib/rate-limit", () => ({
  authMutationRateLimiter: { check: mockRateLimitCheck },
  getClientIpFromHeaders: mock(() => Promise.resolve("1.2.3.4")),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  execute: (user: {
    id: string;
    email: string;
    name: string;
    role: string;
  }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string; code?: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  try {
    const data = await opts.execute({
      id: "admin-user-id",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
    });
    if (opts.afterSuccess) await opts.afterSuccess(data);
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return { error: msg };
  }
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => {}),
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { sendTestEmailAction } =
  await import("@/admin/actions/settings/test-email");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Tests
// =============================================================================

describe("sendTestEmailAction", () => {
  beforeEach(() => {
    mockSendTestEmail.mockClear();
    mockValidateSenderDomain.mockClear();
    mockGetEmailDeliverySettings.mockClear();
    mockGetSeoSettings.mockClear();
    mockRateLimitCheck.mockClear();
    mockExecuteAdminMutationResult.mockClear();

    mockSendTestEmail.mockResolvedValue({ ok: true, messageId: "re_ok" });
    mockValidateSenderDomain.mockResolvedValue({ ok: true });
    mockRateLimitCheck.mockResolvedValue({
      success: true,
      remaining: 19,
      reset: Date.now() + 900000,
    });
  });

  test("invalid email → MutationError with specific field message, sendTestEmail not called", async () => {
    const r = await sendTestEmailAction("not-an-email");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) {
      // generic "入力内容に誤りがあります" ではなく Zod field message が返る
      expect(r.error).toContain("メールアドレス");
    }
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("rate-limit exceeded → MutationError 'too many requests'", async () => {
    mockRateLimitCheck.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 900000,
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("sender domain unverified → MutationError, sendTestEmail not called", async () => {
    mockValidateSenderDomain.mockResolvedValueOnce({
      ok: false,
      verifiedDomains: ["other.com"],
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toContain("検証");
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("happy path returns { messageId }", async () => {
    mockSendTestEmail.mockResolvedValueOnce({
      ok: true,
      messageId: "re_happy",
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(false);
    if (!isMutationError(r)) expect(r.messageId).toBe("re_happy");
    expect(mockSendTestEmail).toHaveBeenCalledTimes(1);
  });

  test("simulator address passes simulatorAddress=true to wrapper", async () => {
    await sendTestEmailAction("delivered@resend.dev", {
      simulatorAddress: true,
    });
    const call = mockSendTestEmail.mock.calls[0]?.[0] as {
      simulatorAddress: boolean;
    };
    expect(call.simulatorAddress).toBe(true);
  });

  test("non-simulator address passes simulatorAddress=false", async () => {
    await sendTestEmailAction("admin@example.com");
    const call = mockSendTestEmail.mock.calls[0]?.[0] as {
      simulatorAddress: boolean;
    };
    expect(call.simulatorAddress).toBe(false);
  });

  test("Resend disabled → MutationError 'メール送信が無効'", async () => {
    mockSendTestEmail.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toContain("無効");
  });

  test("Resend API error → MutationError carries error message", async () => {
    mockSendTestEmail.mockResolvedValueOnce({
      ok: false,
      reason: "error",
      error: "メール送信に失敗しました",
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toBe("メール送信に失敗しました");
  });

  test("RBAC resource/action set to settings/update", async () => {
    await sendTestEmailAction("admin@example.com");
    const opts = mockExecuteAdminMutationResult.mock.calls[0]?.[0];
    expect(opts?.resource).toBe("settings");
    expect(opts?.action).toBe("update");
  });
});
