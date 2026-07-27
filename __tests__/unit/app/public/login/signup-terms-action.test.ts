import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import type { MutationError } from "@/shared/lib/mutation-result";

mock.module("server-only", () => ({}));

const mockCookieSet = mock(() => undefined);
mock.module("next/headers", () => ({
  cookies: mock(() =>
    Promise.resolve({
      set: mockCookieSet,
    }),
  ),
}));

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/domain/settings/turnstile", () => ({
  validateTurnstile: mockValidateTurnstile,
}));
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  createValidationMutationError: (error: unknown) => ({
    ok: false as const,
    error: String(error),
  }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
}));

mock.module("@/shared/lib/signup-terms-cookie", () => ({
  SIGNUP_TERMS_COOKIE_NAME: "signup_terms_agreement",
  SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS: 1800,
  encodeSignupTermsCookie: mock((ids: readonly string[]) =>
    JSON.stringify(ids),
  ),
}));

const TERMS_ID_A = "11111111-1111-4111-8111-111111111111";

const mockAssertAllRequiredTermsAgreed = mock(() =>
  Promise.resolve({ matchedTermsIds: [TERMS_ID_A] }),
);
mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertAllRequiredTermsAgreed: mockAssertAllRequiredTermsAgreed,
  assertLoginSignupReagreed: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  TermsScope: {
    RESERVATION: "RESERVATION",
    INQUIRY: "INQUIRY",
    LOGIN_SIGNUP: "LOGIN_SIGNUP",
    EVENT_REGISTRATION: "EVENT_REGISTRATION",
    RESERVATION_SERIES: "RESERVATION_SERIES",
  },
}));

const mockGetPublicMaintenanceBlockMutation = mock(
  (): Promise<MutationError | null> => Promise.resolve(null),
);

mock.module("@/shared/domain/settings/maintenance-guard", () => ({
  getPublicMaintenanceBlockMutation: mockGetPublicMaintenanceBlockMutation,
}));

describe("setSignupTermsAgreementCookie", () => {
  beforeEach(() => {
    mockCookieSet.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
    mockAssertAllRequiredTermsAgreed.mockClear();
    mockGetPublicMaintenanceBlockMutation.mockClear();

    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockAssertAllRequiredTermsAgreed.mockImplementation(() =>
      Promise.resolve({ matchedTermsIds: [TERMS_ID_A] }),
    );
    mockGetPublicMaintenanceBlockMutation.mockImplementation(() =>
      Promise.resolve(null),
    );
  });

  test("parse 成功後に LOGIN_SIGNUP scope gate を呼び cookie を保存", async () => {
    const { setSignupTermsAgreementCookie } =
      await import("@/app/(public)/login/_components/signup-terms-action");

    const result = await setSignupTermsAgreementCookie({
      termsIds: [TERMS_ID_A],
      turnstileToken: "token",
    });

    expect(result).toEqual({ ok: true });
    expect(mockAssertAllRequiredTermsAgreed).toHaveBeenCalledWith({
      scope: "LOGIN_SIGNUP",
      agreedTermsIds: [TERMS_ID_A],
    });
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
  });

  test("gate が DomainError を throw したら MutationError を返し cookie を保存しない", async () => {
    mockAssertAllRequiredTermsAgreed.mockImplementation(() =>
      Promise.reject(
        new DomainError("すべての必須規約への同意が必要です", "VALIDATION"),
      ),
    );

    const { setSignupTermsAgreementCookie } =
      await import("@/app/(public)/login/_components/signup-terms-action");

    const result = await setSignupTermsAgreementCookie({
      termsIds: [TERMS_ID_A],
      turnstileToken: "token",
    });

    expect(result).toEqual({
      error: "すべての必須規約への同意が必要です",
    });
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  test("maintenance ON のとき cookie を保存せず MAINTENANCE を返す", async () => {
    mockGetPublicMaintenanceBlockMutation.mockImplementation(() =>
      Promise.resolve({
        error:
          "只今メンテナンス中のため、操作を受け付けておりません。しばらくお待ちください。",
        code: "MAINTENANCE",
      }),
    );

    const { setSignupTermsAgreementCookie } =
      await import("@/app/(public)/login/_components/signup-terms-action");

    const result = await setSignupTermsAgreementCookie({
      termsIds: [TERMS_ID_A],
      turnstileToken: "token",
    });

    expect(result).toEqual({
      error:
        "只今メンテナンス中のため、操作を受け付けておりません。しばらくお待ちください。",
      code: "MAINTENANCE",
    });
    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
  });
});
