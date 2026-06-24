import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockResendSend = mock<
  (
    payload: unknown,
    options?: { idempotencyKey?: string },
  ) => Promise<{
    data?: { id: string } | null;
    error?: { name: string; message: string } | null;
  }>
>(() => Promise.resolve({ data: { id: "re_default" }, error: null }));

const mockIsEmailEnabled = mock(() => Promise.resolve(true));
const mockGetResendClient = mock(() =>
  Promise.resolve({ emails: { send: mockResendSend } }),
);
const mockGetFromAddress = mock(() => "Test <test@example.com>");
const mockGetEmailDeliverySettings = mock(() =>
  Promise.resolve({
    senderEmail: "from@x.com",
    senderName: "X",
    replyToEmail: null,
  }),
);

mock.module("@/shared/lib/email/client", () => ({
  isEmailEnabled: mockIsEmailEnabled,
  getResendClient: mockGetResendClient,
  getFromAddress: mockGetFromAddress,
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
}));

// Resend webhook suppression check (bulk fetch) を素通しさせる:
// Bun 公式 re-export pattern で他の export を保ち `getSuppressedEmailSet` のみ
// module-level mock に差し替える。デフォルトは空 Set (= 送信許可)。
const actualCustomersQueries =
  await import("@/shared/domain/customers/queries");
const mockGetSuppressedEmailSet = mock<
  (emails: readonly string[]) => Promise<Set<string>>
>(() => Promise.resolve(new Set()));
mock.module("@/shared/domain/customers/queries", () => ({
  ...actualCustomersQueries,
  getSuppressedEmailSet: mockGetSuppressedEmailSet,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { sendEmail } = await import("@/shared/lib/email/send");

describe("sendEmail return shape (new EmailResult)", () => {
  beforeEach(() => {
    mockResendSend.mockClear();
    mockIsEmailEnabled.mockClear();
    mockGetResendClient.mockClear();
    mockGetFromAddress.mockClear();
    mockGetEmailDeliverySettings.mockClear();
    mockGetSuppressedEmailSet.mockReset();
    mockGetSuppressedEmailSet.mockResolvedValue(new Set());
  });

  test("happy path returns ok:true with messageId from Resend response", async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: "re_abc123" },
      error: null,
    });
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
    });
    expect(result).toEqual({ ok: true, messageId: "re_abc123" });
  });

  test("disabled state returns ok:false reason:disabled (no API key)", async () => {
    mockIsEmailEnabled.mockResolvedValueOnce(false);
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
    });
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  test("Resend API error after retries returns ok:false reason:error", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid recipient" },
    });
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
      maxRetries: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      if (result.reason === "error") expect(result.error).toBeTruthy();
    }
  });
});
