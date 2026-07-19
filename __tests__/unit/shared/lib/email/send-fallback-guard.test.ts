/**
 * `sendEmail` は `getFromAddress` が throw した場合（env `EMAIL_FROM` と
 * DB `Settings.senderEmail` が両方 unset）に silent crash ではなく
 * `{ ok: false, reason: "error" }` を返し、audit log に remediation メッセージを
 * 残すことを保証する。
 *
 * これは M11 fix の回帰防止テスト: 旧仕様のハードコード既定値 `"noreply@example.com"`
 * fallback を復活させて Resend 403 loop に戻さないことを固定する。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockResendSend = mock<
  (
    payload: unknown,
    options?: unknown,
  ) => Promise<{
    data: { id: string } | null;
    error: { name: string; message: string } | null;
  }>
>();

const mockIsEmailEnabled = mock<() => boolean>(() => true);
const mockGetResendClient = mock<
  () => { emails: { send: typeof mockResendSend } } | null
>(() => ({ emails: { send: mockResendSend } }));

const MISCONFIG_MESSAGE =
  "Email sender address is not configured. Set env EMAIL_FROM " +
  "or configure Settings.senderEmail in /admin/settings/integrations. " +
  "The address must belong to a Resend-verified domain.";

// `getFromAddress` は resolveSenderEmailAddress を経由するが、send-fallback-guard の
// 範囲では throw 転送の挙動だけ検証すれば十分。本テストは resolveSenderEmailAddress の
// throw が sendEmail 側でどう扱われるかを固定するため、mock で直接 throw させる。
const mockGetFromAddress = mock<
  (senderEmail?: string | null, senderName?: string | null) => string
>(() => {
  throw new Error(MISCONFIG_MESSAGE);
});

const mockLogError = mock<
  (error: Error, context: Record<string, unknown>) => void
>(() => {});
const mockNormalizeError = mock<(e: unknown) => Error>((e: unknown) =>
  e instanceof Error ? e : new Error(String(e)),
);

const DELIVERY_DEFAULTS = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  senderEmail: null as string | null,
  senderName: null as string | null,
  replyToEmail: null as string | null,
};

const mockGetEmailDeliverySettings = mock(() =>
  Promise.resolve(DELIVERY_DEFAULTS),
);

mock.module("@/shared/lib/email/client", () => ({
  isEmailEnabled: mockIsEmailEnabled,
  getResendClient: mockGetResendClient,
  getFromAddress: mockGetFromAddress,
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM", LOW: "LOW" },
  logError: mockLogError,
  normalizeError: mockNormalizeError,
}));

const actualCustomersQueries =
  await import("@/shared/domain/customers/queries");
const mockGetSuppressedEmailSet = mock<() => Promise<Set<string>>>(() =>
  Promise.resolve(new Set()),
);
mock.module("@/shared/domain/customers/queries", () => ({
  ...actualCustomersQueries,
  getSuppressedEmailSet: mockGetSuppressedEmailSet,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendEmail } from "@/shared/lib/email/send";

const VALID_PAYLOAD = {
  to: "customer@example.com",
  subject: "テスト件名",
  html: "<p>テスト本文</p>",
};

const BASE_PARAMS = {
  payload: VALID_PAYLOAD,
  operation: "misconfigTestOperation",
};

describe("sendEmail — unresolvable sender fallback guard (M11)", () => {
  beforeEach(() => {
    mockResendSend.mockReset();
    mockIsEmailEnabled.mockReset();
    mockGetResendClient.mockReset();
    mockLogError.mockReset();
    mockNormalizeError.mockReset();
    mockGetSuppressedEmailSet.mockReset();
    mockGetSuppressedEmailSet.mockResolvedValue(new Set());

    mockIsEmailEnabled.mockReturnValue(true);
    mockGetResendClient.mockReturnValue({ emails: { send: mockResendSend } });
    mockNormalizeError.mockImplementation((e: unknown) =>
      e instanceof Error ? e : new Error(String(e)),
    );

    // 既定は throw 動作。個別テストで override する。
    mockGetFromAddress.mockReset();
    mockGetFromAddress.mockImplementation(() => {
      throw new Error(MISCONFIG_MESSAGE);
    });
  });

  test("getFromAddress が throw すると { ok: false, reason: 'error' } を返す", async () => {
    const result = await sendEmail(BASE_PARAMS);

    expect(result).toEqual({
      ok: false,
      reason: "error",
      error: "メール送信に失敗しました",
    });
  });

  test("getFromAddress が throw した場合は Resend SDK を呼ばない", async () => {
    await sendEmail(BASE_PARAMS);

    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test("logError が remediation メッセージ付きで呼ばれる（audit log 経路）", async () => {
    await sendEmail(BASE_PARAMS);

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const [errorArg, contextArg] = mockLogError.mock.calls[0] ?? [];
    expect(errorArg).toBeInstanceOf(Error);
    if (errorArg instanceof Error) {
      expect(errorArg.message).toContain("EMAIL_FROM");
      expect(errorArg.message).toContain("Settings.senderEmail");
      expect(errorArg.message).toContain("Resend-verified domain");
    }
    expect(contextArg).toEqual(
      expect.objectContaining({
        category: "EXTERNAL_API",
        severity: "MEDIUM",
        context: expect.objectContaining({
          operation: "misconfigTestOperation",
        }),
      }),
    );
  });

  test("getFromAddress が正常値を返せば通常送信フローが走る（正常系の非回帰）", async () => {
    mockGetFromAddress.mockReset();
    mockGetFromAddress.mockReturnValue("テスト <ok@myrrh.example.com>");
    mockResendSend.mockResolvedValue({
      data: { id: "msg_ok" },
      error: null,
    });

    const result = await sendEmail(BASE_PARAMS);

    expect(result).toEqual({ ok: true, messageId: "msg_ok" });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });
});
