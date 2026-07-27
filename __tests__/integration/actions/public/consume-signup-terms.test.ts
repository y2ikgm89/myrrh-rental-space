/**
 * consumeSignupTermsAction Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/consume-signup-terms.ts のテスト
 *
 * MYPAGE-AUTH-03 (2026-07-18): `isNew` による早期 return を廃止し、cookie の
 * presence を判定基準にした挙動を固定する。旧版は初回訪問で TermsAgreement
 * insert が失敗した場合、次回 (isNew=false) は cookie を無視して削除するだけで
 * retry しなかったため、同意 evidence が永久消失していた。
 *
 * 本テストで固定する契約:
 * - cookie 無 → 何もしない (no-op)
 * - cookie 有 + termsIds decode 失敗 → cookie 削除のみ
 * - cookie 有 + termsIds decode 成功 + 既存 agreement 無 → insert 実行 → cookie 削除
 *   (isNew=true と false の両方で発火)
 * - cookie 有 + 既存 agreement あり → insert skip + cookie 削除
 * - cookie 有 + insert throw → cookie 削除しない (retry 用に保持)
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

// next/headers モック — cookies.get / delete と headers を差し替え可能にする
const mockCookieGet = mock<(name: string) => { value: string } | undefined>(
  () => undefined,
);
const mockCookieDelete = mock<(name: string) => void>(() => undefined);

mock.module("next/headers", () => ({
  cookies: mock(() =>
    Promise.resolve({
      get: mockCookieGet,
      delete: mockCookieDelete,
    }),
  ),
  headers: mock(() =>
    Promise.resolve(
      new Headers({
        "user-agent": "test-agent/1.0",
      }),
    ),
  ),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// rate-limit モック (getClientIpFromHeaders を提供)
mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  publicQueryRateLimiter: {},
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

// signup-terms-cookie モック — 実 HMAC を経由せず decode 結果を制御
const TERMS_ID_A = "11111111-1111-4111-8111-111111111111";
const TERMS_ID_B = "22222222-2222-4222-8222-222222222222";

const mockDecodeSignupTermsCookie = mock<(value: string) => readonly string[]>(
  () => [],
);

mock.module("@/shared/lib/signup-terms-cookie", () => ({
  SIGNUP_TERMS_COOKIE_NAME: "signup_terms_agreement",
  SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS: 1800,
  decodeSignupTermsCookie: mockDecodeSignupTermsCookie,
  encodeSignupTermsCookie: mock(() => "unused"),
}));

// customer-auth モック
const mockVerifyCustomerSession = mock(() =>
  Promise.resolve({
    user: { id: "user-001", name: "テストユーザー" },
  }),
);
mock.module("@/shared/lib/customer-auth", () => ({
  verifyCustomerSession: mockVerifyCustomerSession,
  getCustomerSession: mock(() => Promise.resolve(null)),
  customerAuth: { api: {} },
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
}));

// ensureCustomerLinked モック — MYPAGE-AUTH-03 の焦点である isNew を制御
const mockEnsureCustomerLinked = mock(
  (): Promise<{ customer: { id: string }; isNew: boolean }> =>
    Promise.resolve({
      customer: { id: "customer-001" },
      isNew: true,
    }),
);
mock.module("@/shared/domain/customers/link", () => ({
  ensureCustomerLinked: mockEnsureCustomerLinked,
}));

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mock(() => Promise.resolve(undefined)),
}));

// recordTermsAgreementsCommand モック — 成否をテスト毎に制御
const mockRecordTermsAgreementsCommand = mock((): Promise<{ count: number }> =>
  Promise.resolve({ count: 1 }),
);
mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mockRecordTermsAgreementsCommand,
  createTermsCommand: mock(() => Promise.resolve({})),
  updateTermsCommand: mock(() => Promise.resolve({})),
  reorderTermsCommand: mock(() => Promise.resolve({ updated: 0 })),
  updateTermsPublishedCommand: mock(() => Promise.resolve({})),
  updateTermsFooterVisibilityCommand: mock(() => Promise.resolve({})),
  softDeleteTermsCommand: mock(() => Promise.resolve({})),
  hardDeleteTermsCommand: mock(() => Promise.resolve({})),
  restoreTermsCommand: mock(() => Promise.resolve({})),
  recordTermsAgreements: mock(() => Promise.resolve([])),
}));

// hasTermsAgreementRecorded モック — idempotency guard を制御
const mockHasTermsAgreementRecorded = mock(() => Promise.resolve(false));
mock.module("@/shared/domain/terms/queries", () => ({
  hasTermsAgreementRecorded: mockHasTermsAgreementRecorded,
  getPublishedTermsList: mock(() => Promise.resolve([])),
  getFooterTerms: mock(() => Promise.resolve([])),
  getPublicTermsBySlug: mock(() => Promise.resolve(null)),
  getPublishedTermsByType: mock(() => Promise.resolve(null)),
  getRequiredTermsByScope: mock(() => Promise.resolve([])),
}));

const mockAssertAllRequiredTermsAgreed = mock(() =>
  Promise.resolve({ matchedTermsIds: [] as string[] }),
);
mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertAllRequiredTermsAgreed: mockAssertAllRequiredTermsAgreed,
  assertLoginSignupReagreed: mock(() => Promise.resolve()),
}));

// enums モック — TermsScope.LOGIN_SIGNUP を expose
mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  TermsScope: {
    RESERVATION: "RESERVATION",
    INQUIRY: "INQUIRY",
    LOGIN_SIGNUP: "LOGIN_SIGNUP",
    EVENT_REGISTRATION: "EVENT_REGISTRATION",
    RESERVATION_SERIES: "RESERVATION_SERIES",
  },
}));

// =============================================================================
// テスト本体
// =============================================================================

describe("consumeSignupTermsAction", () => {
  beforeEach(() => {
    mockCookieGet.mockClear();
    mockCookieDelete.mockClear();
    mockDecodeSignupTermsCookie.mockClear();
    mockVerifyCustomerSession.mockClear();
    mockEnsureCustomerLinked.mockClear();
    mockRecordTermsAgreementsCommand.mockClear();
    mockHasTermsAgreementRecorded.mockClear();
    mockAssertAllRequiredTermsAgreed.mockClear();

    // Default: cookie 有 + decode 成功 + 既存無 + insert 成功
    mockCookieGet.mockImplementation((name) =>
      name === "signup_terms_agreement"
        ? { value: "signed-cookie-value" }
        : undefined,
    );
    mockDecodeSignupTermsCookie.mockImplementation(() => [TERMS_ID_A]);
    mockVerifyCustomerSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "user-001", name: "テストユーザー" } }),
    );
    mockEnsureCustomerLinked.mockImplementation(() =>
      Promise.resolve({ customer: { id: "customer-001" }, isNew: true }),
    );
    mockHasTermsAgreementRecorded.mockImplementation(() =>
      Promise.resolve(false),
    );
    mockRecordTermsAgreementsCommand.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );
    mockAssertAllRequiredTermsAgreed.mockImplementation(() =>
      Promise.resolve({ matchedTermsIds: [] }),
    );
  });

  describe("cookie 無し", () => {
    test("cookie 無しは no-op (verifyCustomerSession も走らない)", async () => {
      mockCookieGet.mockImplementation(() => undefined);

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: true });

      expect(mockVerifyCustomerSession).not.toHaveBeenCalled();
      expect(mockEnsureCustomerLinked).not.toHaveBeenCalled();
      expect(mockRecordTermsAgreementsCommand).not.toHaveBeenCalled();
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });
  });

  describe("cookie 有・decode 失敗", () => {
    test("termsIds が空配列のとき insert せず cookie だけ削除", async () => {
      mockDecodeSignupTermsCookie.mockImplementation(() => []);

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: true });

      expect(mockRecordTermsAgreementsCommand).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledTimes(1);
      expect(mockCookieDelete).toHaveBeenCalledWith("signup_terms_agreement");
    });
  });

  describe("MYPAGE-AUTH-03: isNew=false でも insert が走る", () => {
    test("isNew=false + cookie 有 + 既存 agreement 無 → insert 実行", async () => {
      mockEnsureCustomerLinked.mockImplementation(() =>
        Promise.resolve({ customer: { id: "customer-001" }, isNew: false }),
      );

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: false });

      // 旧版 (isNew=false 早期 return) は false でスキップしていたが、
      // 現版は cookie presence 判定なので insert が実行される。
      expect(mockRecordTermsAgreementsCommand).toHaveBeenCalledTimes(1);
      expect(mockRecordTermsAgreementsCommand).toHaveBeenCalledWith({
        termsIds: [TERMS_ID_A],
        scope: "LOGIN_SIGNUP",
        customerId: "customer-001",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent/1.0",
      });
      expect(mockCookieDelete).toHaveBeenCalledTimes(1);
    });

    test("isNew=true + cookie 有 + 既存 agreement 無 → insert 実行 (回帰: 旧版と同じ path)", async () => {
      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: true });

      expect(mockRecordTermsAgreementsCommand).toHaveBeenCalledTimes(1);
      expect(mockCookieDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("idempotency guard: 既存 agreement あり", () => {
    test("既存 agreement ありなら insert せず cookie だけ削除", async () => {
      mockHasTermsAgreementRecorded.mockImplementation(() =>
        Promise.resolve(true),
      );

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: false });

      expect(mockHasTermsAgreementRecorded).toHaveBeenCalledTimes(1);
      expect(mockHasTermsAgreementRecorded).toHaveBeenCalledWith({
        customerId: "customer-001",
        scope: "LOGIN_SIGNUP",
        termsIds: [TERMS_ID_A],
      });
      expect(mockRecordTermsAgreementsCommand).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("signup gate: assertAllRequiredTermsAgreed", () => {
    test("記録前に LOGIN_SIGNUP scope gate を呼ぶ", async () => {
      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: true });

      expect(mockAssertAllRequiredTermsAgreed).toHaveBeenCalledTimes(1);
      expect(mockAssertAllRequiredTermsAgreed).toHaveBeenCalledWith({
        scope: "LOGIN_SIGNUP",
        agreedTermsIds: [TERMS_ID_A],
      });
    });

    test("gate が DomainError を throw したら insert せず cookie を保持", async () => {
      mockAssertAllRequiredTermsAgreed.mockImplementation(() =>
        Promise.reject(
          new DomainError("すべての必須規約への同意が必要です", "VALIDATION"),
        ),
      );

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await expect(consumeSignupTermsAction({ isNew: true })).rejects.toThrow(
        "すべての必須規約への同意が必要です",
      );
      expect(mockRecordTermsAgreementsCommand).not.toHaveBeenCalled();
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });
  });

  describe("insert 失敗 → cookie 保持 (retry)", () => {
    test("recordTermsAgreementsCommand が throw したら cookie は削除されない", async () => {
      mockRecordTermsAgreementsCommand.mockImplementation(() =>
        Promise.reject(new Error("transient db error")),
      );

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      let caught: unknown = null;
      try {
        await consumeSignupTermsAction({ isNew: false });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      // 記録は試みたが失敗 → cookie は残っている (次回訪問で retry される)
      expect(mockRecordTermsAgreementsCommand).toHaveBeenCalledTimes(1);
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });
  });

  describe("複数 termsIds の伝播", () => {
    test("decode 結果を recordTermsAgreementsCommand と hasTermsAgreementRecorded に伝える", async () => {
      mockDecodeSignupTermsCookie.mockImplementation(() => [
        TERMS_ID_A,
        TERMS_ID_B,
      ]);

      const { consumeSignupTermsAction } =
        await import("@/app/(public)/_shared/actions/consume-signup-terms");

      await consumeSignupTermsAction({ isNew: true });

      expect(mockHasTermsAgreementRecorded).toHaveBeenCalledWith({
        customerId: "customer-001",
        scope: "LOGIN_SIGNUP",
        termsIds: [TERMS_ID_A, TERMS_ID_B],
      });
      expect(mockRecordTermsAgreementsCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          termsIds: [TERMS_ID_A, TERMS_ID_B],
          scope: "LOGIN_SIGNUP",
        }),
      );
    });
  });
});
