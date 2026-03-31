/**
 * 公開問い合わせフォーム Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/inquiry.ts のテスト
 *
 * モック方針:
 * - validateTurnstile: action-helpers をモック（常に成功を返す）
 * - createInquiryCommand: domain コマンドをモック
 * - email 送信: email-service をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  validateTurnstile: mockValidateTurnstile,
  checkActionRateLimit: mockCheckActionRateLimit,
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

const mockCreateInquiryCommand = mock(() =>
  Promise.resolve({
    id: "inquiry-001",
    emailData: {
      inquiryId: "inquiry-001",
      name: "テスト太郎",
      email: "test@example.com",
      subject: "テスト件名",
      message: "テストメッセージ",
    },
  }),
);

mock.module("@/shared/domain/inquiries/commands", () => ({
  createInquiryCommand: mockCreateInquiryCommand,
}));

const mockSendContactConfirmationEmail = mock(() => Promise.resolve());
const mockSendContactAdminNotification = mock(() => Promise.resolve());

mock.module("@/shared/lib/email/contact-emails", () => ({
  sendContactConfirmationEmail: mockSendContactConfirmationEmail,
  sendContactAdminNotification: mockSendContactAdminNotification,
}));

const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    // テスト用に即時実行（エラーは無視）
    void promise.catch(() => {});
  },
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

// server-only モック（テスト環境で server-only を無効化）
mock.module("server-only", () => ({}));

/** Next の request scope なしでも動かす（getSession は headers に依存） */
const mockGetSession = mock(() => Promise.resolve(null));

mock.module("@/shared/lib/auth", () => ({
  getSession: mockGetSession,
  getCurrentUser: mock(() => Promise.resolve(null)),
  verifySession: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  isAdmin: mock(() => Promise.resolve(false)),
  getSessionUser: () => null,
  getRoleFromSession: () => null,
  isValidRole: () => false,
  auth: {},
}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_INPUT = {
  customerType: "personal" as const,
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  subject: "スペース利用について",
  message: "大人数での利用は可能でしょうか？詳しく教えていただけますか。",
  turnstileToken: "test-token-valid",
};

// =============================================================================
// テスト本体
// =============================================================================

describe("submitInquiry", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetSession.mockImplementation(() => Promise.resolve(null));
    mockValidateTurnstile.mockClear();
    mockCreateInquiryCommand.mockClear();
    mockSendContactConfirmationEmail.mockClear();
    mockSendContactAdminNotification.mockClear();
    mockUpdateTag.mockClear();
    // 成功レスポンスにリセット
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCreateInquiryCommand.mockImplementation(() =>
      Promise.resolve({
        id: "inquiry-001",
        emailData: {
          inquiryId: "inquiry-001",
          name: `${VALID_INPUT.lastName} ${VALID_INPUT.firstName}`,
          email: VALID_INPUT.email,
          subject: VALID_INPUT.subject,
          message: VALID_INPUT.message,
        },
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力で問い合わせ作成が成功し id を返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry(VALID_INPUT);

      expect(result).toEqual({ id: "inquiry-001" });
    });

    test("createInquiryCommand が name / email / subject / message を引数に呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(VALID_INPUT);

      expect(mockCreateInquiryCommand).toHaveBeenCalledTimes(1);
      expect(mockCreateInquiryCommand).toHaveBeenCalledWith({
        name: `${VALID_INPUT.lastName} ${VALID_INPUT.firstName}`,
        companyName: null,
        customerId: null,
        email: VALID_INPUT.email,
        subject: VALID_INPUT.subject,
        message: VALID_INPUT.message,
      });
    });

    test("updateTag がキャッシュ無効化のために呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(VALID_INPUT);

      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test("turnstileToken が undefined でも Turnstile 検証が呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const inputWithoutToken = { ...VALID_INPUT, turnstileToken: undefined };
      await submitInquiry(inputWithoutToken);

      expect(mockValidateTurnstile).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("lastName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({ ...VALID_INPUT, lastName: "" });

      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("fieldErrors");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("lastName");
    });

    test("email が無効な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({
        ...VALID_INPUT,
        email: "not-an-email",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("email");
    });

    test("subject が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({ ...VALID_INPUT, subject: "" });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("subject");
    });

    test("message が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({ ...VALID_INPUT, message: "" });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("message");
    });

    test("lastName が 50 文字超のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({
        ...VALID_INPUT,
        lastName: "あ".repeat(51),
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("lastName");
    });

    test("message が 5000 文字超のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry({
        ...VALID_INPUT,
        message: "あ".repeat(5001),
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("message");
    });

    test("バリデーション失敗時は createInquiryCommand が呼ばれない", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry({ ...VALID_INPUT, lastName: "" });

      expect(mockCreateInquiryCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: Turnstile 検証失敗", () => {
    test("Turnstile 検証失敗時はエラーを返す", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toContain("セキュリティ検証");
    });

    test("Turnstile 失敗時は createInquiryCommand が呼ばれない", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "セキュリティ検証に失敗しました。",
        }),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(VALID_INPUT);

      expect(mockCreateInquiryCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("createInquiryCommand が DomainError をスローしたとき MutationError を返す", async () => {
      mockCreateInquiryCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("DB エラーが発生しました", "UNEXPECTED"),
        ),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = await submitInquiry(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("DB エラーが発生しました");
    });

    test("createInquiryCommand が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreateInquiryCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないエラー")),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await expect(submitInquiry(VALID_INPUT)).rejects.toThrow(
        "予期しないエラー",
      );
    });
  });

  describe("publicInquirySchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { publicInquirySchema } =
        await import("@/shared/lib/validations/inquiry");

      const result = publicInquirySchema.safeParse({
        lastName: "田中",
        firstName: "花子",
        email: "tanaka@example.com",
        subject: "件名",
        message: "本文",
      });

      expect(result.success).toBe(true);
    });

    test("turnstileToken は省略可能", async () => {
      const { publicInquirySchema } =
        await import("@/shared/lib/validations/inquiry");

      const result = publicInquirySchema.safeParse({
        lastName: "田中",
        firstName: "花子",
        email: "tanaka@example.com",
        subject: "件名",
        message: "本文",
        // turnstileToken なし
      });

      expect(result.success).toBe(true);
    });

    test("subject が 200 文字以内で通過", async () => {
      const { publicInquirySchema } =
        await import("@/shared/lib/validations/inquiry");

      const result = publicInquirySchema.safeParse({
        ...VALID_INPUT,
        subject: "あ".repeat(200),
      });

      expect(result.success).toBe(true);
    });

    test("subject が 201 文字で失敗", async () => {
      const { publicInquirySchema } =
        await import("@/shared/lib/validations/inquiry");

      const result = publicInquirySchema.safeParse({
        ...VALID_INPUT,
        subject: "あ".repeat(201),
      });

      expect(result.success).toBe(false);
    });
  });
});
