/**
 * sendTemplateTestAction — suppression branch surfaces distinct error (M5)
 *
 * `sendEmail` が新しく返す `{ ok: false, reason: "suppressed" }` を admin テスト送信
 * Server Action が「RESEND_API_KEY 未設定」ではなく「配信停止（バウンス/苦情）」の
 * distinct なメッセージに変換することを検証する。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { expectErrorResult } from "../../../helpers/type-assertions";
import { installEmailRenderContextMock } from "../../../support/email-render-context-mock";

installEmailRenderContextMock();

type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "suppressed"; suppressedRecipients: readonly string[] }
  | { ok: false; reason: "error"; error: string };

const mockSendTest = mock<() => Promise<SendResult>>(() =>
  Promise.resolve({ ok: true, messageId: "msg-1" }),
);

const mockGetTemplate = mock(() => ({
  sendTest: mockSendTest,
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// executeAdminMutationResult は認証・認可・logAction 等を全て通した後 execute(user) を
// 呼ぶ契約。テストでは中身をショートカットして直接 execute を実行し、
// DomainError → MutationError の変換だけ通す最小版を提供する。
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async (options: {
    execute: (user: {
      id: string;
      email: string;
      name?: string;
    }) => Promise<unknown>;
  }) => {
    try {
      return await options.execute({
        id: "user-1",
        email: "staff@example.com",
        name: "Staff",
      });
    } catch (error) {
      // DomainError は execute 内で throw され、MutationError 形状に落とす。
      if (error instanceof Error) {
        return { error: error.message };
      }
      return { error: String(error) };
    }
  },
}));

// PR #1274 (L4) が sendTemplateTestAction の rate limiter を authMutationRateLimiter
// から専用の templateTestSendRateLimiter (10 / 15min / user.id) に切り替えたため、
// mock は両者を持つ必要がある — 実装は templateTestSendRateLimiter のみを直接 import
// するが、mock.module は module 全体を差し替えるので、他の consumer 側の import が
// 未 mock export に触ると `Export named 'X' not found in module 'Y'` で SyntaxError。
// 実装が触る export を欠くと bun test process 起動時点で fail する (PR-I + PR-H の
// merge 後に main で発火した regression の修正)。
mock.module("@/shared/lib/rate-limit", () => ({
  authMutationRateLimiter: {
    check: mock(async () => ({ success: true })),
  },
  templateTestSendRateLimiter: {
    check: mock(async () => ({ success: true })),
  },
  getClientIpFromHeaders: mock(async () => "127.0.0.1"),
}));

mock.module("@/shared/lib/email/domain-verification", () => ({
  validateSenderDomain: mock(async () => ({ ok: true as const })),
}));

mock.module("@/shared/lib/email/client", () => ({
  resolveSenderEmailAddress: mock(
    (email: string | null) => email ?? "noreply@example.com",
  ),
  resolveTransportApiKey: mock(
    (key: string | null | undefined) => key ?? "re_test_key",
  ),
  isEmailTransportEnabled: mock(() => true),
  getFromAddress: mock(() => "Test <noreply@example.com>"),
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mock(async () => ({
    senderEmail: "noreply@example.com",
    senderName: "Test",
    replyToEmail: null,
    sendReservationConfirmationEmail: true,
    notifyNewReservation: true,
    notifyReservationChange: true,
    notifyReservationCancel: true,
    notifyNewInquiry: true,
  })),
}));

mock.module("@/shared/domain/settings/queries/site", () => ({
  getSeoSettings: mock(async () => ({ siteName: "Test Site" })),
}));

mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: mock(async () => ({})),
}));

mock.module("@/shared/emails/_registry", () => ({
  getTemplate: (...args: Parameters<typeof mockGetTemplate>) =>
    mockGetTemplate(...args),
}));

const { sendTemplateTestAction } =
  await import("@/admin/actions/settings/template-test-send");

describe("sendTemplateTestAction — suppressed branch", () => {
  beforeEach(() => {
    mockSendTest.mockReset();
  });

  test("sendEmail が reason: 'suppressed' を返した場合、配信停止の distinct メッセージで失敗する", async () => {
    mockSendTest.mockResolvedValueOnce({
      ok: false,
      reason: "suppressed",
      suppressedRecipients: ["bounced@example.com"],
    });

    const result = await sendTemplateTestAction(
      "welcome",
      "bounced@example.com",
    );
    expectErrorResult(result);

    // 「RESEND_API_KEY が設定されていません」ではなく配信停止の文言が返る
    expect(result.error).toContain("配信停止");
    expect(result.error).not.toContain("RESEND_API_KEY");
  });

  test("sendEmail が reason: 'disabled' を返した場合、RESEND_API_KEY 未設定のメッセージが返る (回帰防止)", async () => {
    mockSendTest.mockResolvedValueOnce({ ok: false, reason: "disabled" });

    const result = await sendTemplateTestAction("welcome", "ok@example.com");
    expectErrorResult(result);

    expect(result.error).toContain("RESEND_API_KEY");
  });
});
