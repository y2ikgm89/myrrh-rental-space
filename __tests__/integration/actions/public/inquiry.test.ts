/**
 * 公開問い合わせフォーム Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/inquiry.ts のテスト
 *
 * Phase 2 conform 移行後:
 *   signature: `(_prev: SubmissionResult | undefined, formData: FormData) => Promise<SubmissionResult>`
 *   - parseWithZod (`@conform-to/zod/v4`) で FormData → input
 *   - `submission.reply()` で field-level errors
 *   - `submission.reply({ formErrors: [msg] })` で top-level errors (rate limit / Turnstile / DomainError)
 *   - `submission.reply({ resetForm: true })` で success
 *
 * モック方針:
 * - validateTurnstile: action-helpers をモック(常に成功を返す)
 * - createInquiryCommand: domain コマンドをモック
 * - email 送信: email-service をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

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
}));

const mockCreateInquiryCommand = mock(() =>
  Promise.resolve({
    id: "inquiry-001",
    payload: {
      inquiryId: "inquiry-001",
      name: "テスト太郎",
      companyName: null,
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

// terms 系: server-side consent gate + 記録コマンドを no-op に。
// `assertAllRequiredTermsAgreed` は内部で `getRequiredTermsByScope` を呼び、
// 未モックだと Prisma `'use cache'` 経路で SyntaxError 化するため明示的に空配列を返す。
const mockGetRequiredTermsByScope = mock(() => Promise.resolve([]));
const mockRecordTermsAgreementsCommand = mock(() =>
  Promise.resolve({ count: 0 }),
);
mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: mockGetRequiredTermsByScope,
}));
mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mockRecordTermsAgreementsCommand,
}));

const mockUpdateTag = mock(() => undefined);

// 公式 Bun re-export pattern: actual を spread して必要 fn のみ override。
// partial mock は cacheTag/cacheLife/revalidateTag 等を undefined 化し、
// 'use cache' 経路を引く domain query (getSuppressedEmailSet 等) を SyntaxError 化する。
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: mockUpdateTag,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    // テスト用に即時実行(エラーは無視)
    void promise.catch(() => {});
  },
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

// server-only モック(テスト環境で server-only を無効化)
mock.module("server-only", () => ({}));

// `submitInquiry` は `getClientIpFromHeaders` を経由して next/headers を呼ぶため、
// テスト環境では Headers の空インスタンスを返してリクエストスコープエラーを回避する
mock.module("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
  }),
}));

/** Next の request scope なしでも動かす(getSession は headers に依存) */
const mockGetSession = mock(() => Promise.resolve(null));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
  customerAuth: {},
}));

mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mock(() => Promise.resolve(null)),
  getCurrentAdminUser: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  getAdminSessionUser: () => null,
  isAdmin: mock(() => Promise.resolve(false)),
  isValidRole: () => false,
  adminAuth: {},
  DASHBOARD_ROLES: [],
}));

// =============================================================================
// テストデータ
// =============================================================================

type InquiryInputShape = {
  customerType: CustomerType;
  lastName: string;
  firstName: string;
  email: string;
  subject: string;
  message: string;
  companyName?: string;
  turnstileToken?: string;
  agreedTermsIds?: readonly string[];
};

const VALID_INPUT: InquiryInputShape = {
  customerType: CustomerType.PERSONAL,
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  subject: "スペース利用について",
  message: "大人数での利用は可能でしょうか？詳しく教えていただけますか。",
  turnstileToken: "test-token-valid",
};

function inputToFormData(input: InquiryInputShape): FormData {
  const fd = new FormData();
  fd.append("customerType", input.customerType);
  fd.append("lastName", input.lastName);
  fd.append("firstName", input.firstName);
  fd.append("email", input.email);
  fd.append("subject", input.subject);
  fd.append("message", input.message);
  if (input.companyName !== undefined) {
    fd.append("companyName", input.companyName);
  }
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  for (const id of input.agreedTermsIds ?? []) {
    fd.append("agreedTermsIds", id);
  }
  return fd;
}

type SubmissionLike = {
  readonly status?: "success" | "error";
  readonly initialValue?: unknown;
  readonly error?: Record<string, string[] | null> | null;
};

// =============================================================================
// テスト本体
// =============================================================================

describe("submitInquiry", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetSession.mockImplementation(() => Promise.resolve(null));
    mockValidateTurnstile.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockCreateInquiryCommand.mockClear();
    mockSendContactConfirmationEmail.mockClear();
    mockSendContactAdminNotification.mockClear();
    mockUpdateTag.mockClear();
    mockGetRequiredTermsByScope.mockClear();
    mockRecordTermsAgreementsCommand.mockClear();
    mockGetRequiredTermsByScope.mockImplementation(() => Promise.resolve([]));
    // 成功レスポンスにリセット
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCreateInquiryCommand.mockImplementation(() =>
      Promise.resolve({
        id: "inquiry-001",
        payload: {
          inquiryId: "inquiry-001",
          name: `${VALID_INPUT.lastName} ${VALID_INPUT.firstName}`,
          companyName: null,
          email: VALID_INPUT.email,
          subject: VALID_INPUT.subject,
          message: VALID_INPUT.message,
        },
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力で問い合わせ作成が成功する", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData(VALID_INPUT),
      )) as SubmissionLike;

      // conform v1.19: `reply({ resetForm: true })` は `{ initialValue: null }`
      // のみ返し status は未設定。success 検出は initialValue === null が canonical
      expect(result.initialValue).toBeNull();
      expect(result.status).not.toBe("error");
    });

    test("createInquiryCommand が name / email / subject / message を引数に呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateInquiryCommand).toHaveBeenCalledTimes(1);
      expect(mockCreateInquiryCommand).toHaveBeenCalledWith({
        name: `${VALID_INPUT.lastName} ${VALID_INPUT.firstName}`,
        companyName: null,
        customerId: null,
        customerType: VALID_INPUT.customerType,
        email: VALID_INPUT.email,
        subject: VALID_INPUT.subject,
        message: VALID_INPUT.message,
      });
    });

    test("updateTag がキャッシュ無効化のために呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(undefined, inputToFormData(VALID_INPUT));

      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test("turnstileToken が省略されても Turnstile 検証が呼ばれる", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const { turnstileToken: _omit, ...inputWithoutToken } = VALID_INPUT;
      await submitInquiry(undefined, inputToFormData(inputWithoutToken));

      expect(mockValidateTurnstile).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("lastName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
      expect(result.error?.["lastName"]).toBeDefined();
    });

    test("email が無効な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, email: "not-an-email" }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error?.["email"]).toBeDefined();
    });

    test("subject が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, subject: "" }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error?.["subject"]).toBeDefined();
    });

    test("message が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, message: "" }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error?.["message"]).toBeDefined();
    });

    test("lastName が 50 文字超のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "あ".repeat(51) }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error?.["lastName"]).toBeDefined();
    });

    test("message が 5000 文字超のとき fieldErrors を含むエラーを返す", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, message: "あ".repeat(5001) }),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      expect(result.error?.["message"]).toBeDefined();
    });

    test("バリデーション失敗時は createInquiryCommand が呼ばれない", async () => {
      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await submitInquiry(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      );

      expect(mockCreateInquiryCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: Turnstile 検証失敗", () => {
    test("Turnstile 検証失敗時は formErrors に top-level エラーを返す", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData(VALID_INPUT),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors).toBeDefined();
      expect(formErrors?.[0]).toContain("セキュリティ検証");
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

      await submitInquiry(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateInquiryCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("createInquiryCommand が DomainError をスローしたとき formErrors を返す", async () => {
      mockCreateInquiryCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("DB エラーが発生しました", "UNEXPECTED"),
        ),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      const result = (await submitInquiry(
        undefined,
        inputToFormData(VALID_INPUT),
      )) as SubmissionLike;

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toBe("DB エラーが発生しました");
    });

    test("createInquiryCommand が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreateInquiryCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないエラー")),
      );

      const { submitInquiry } =
        await import("@/app/(public)/_shared/actions/inquiry");

      await expect(
        submitInquiry(undefined, inputToFormData(VALID_INPUT)),
      ).rejects.toThrow("予期しないエラー");
    });
  });

  describe("publicInquirySchema バリデーション(単体)", () => {
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
