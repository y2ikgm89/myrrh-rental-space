/**
 * LoginPage redirect guard (MYPAGE-AUTH-01)
 *
 * suspended (Customer.isActive=false) 顧客が /mypage にアクセスした際、
 * MypageAuthGate は `/login?error=account_suspended` へ redirect するが Better Auth
 * session cookie を破棄できない (Server Component 制約)。従来の LoginPage は
 * `if (user) redirect('/mypage')` を無条件実行していたため、mypage ↔ login の無限
 * redirect ループ (ERR_TOO_MANY_REDIRECTS) が発生していた。
 *
 * このテストは LoginPage の redirect 分岐が error=account_suspended を検知して
 * redirect をスキップすることを、`next/navigation` `redirect` の mock 呼び出し履歴
 * で検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック
// =============================================================================

mock.module("server-only", () => ({}));

const mockRedirect = mock((_url: string): never => {
  // 本番の next/navigation redirect は throw で以降実行を中断するが、
  // テストでは呼び出し履歴だけを検証するので no-op にする。
  return undefined as never;
});

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}));

mock.module("next/server", () => ({
  connection: mock((): Promise<void> => Promise.resolve()),
}));

const mockGetCurrentCustomerUser = mock(
  (): Promise<{ id: string; email: string; role: string } | null> =>
    Promise.resolve(null),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCurrentCustomerUser: mockGetCurrentCustomerUser,
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCurrentCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  customerAuth: { api: { signOut: mock(() => Promise.resolve(undefined)) } },
}));

mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: mock(() => Promise.resolve([])),
}));

mock.module("@/shared/data/turnstile", () => ({
  getTurnstileSiteKey: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/e2e-runtime", () => ({
  isCustomerE2ELoginEnabled: () => false,
  isLocalProductionE2ERuntime: () => false,
}));

// LoginHero は StandardHeroSection 経由で GSAP を import する (client subtree)。
// LoginPage は redirect 分岐のみを検証するので、JSX 出力は評価しない代わりに JSX
// を返す軽量スタブを差し込んで gsap の module-init を避ける。
mock.module("@/app/(public)/login/_components/login-hero", () => ({
  LoginHero: () => null,
}));

mock.module("@/app/(public)/login/_components/social-login-buttons", () => ({
  SocialLoginButtons: () => null,
}));

mock.module("@/app/(public)/login/_components/dev-login-button", () => ({
  DevLoginButton: () => null,
}));

mock.module("@/app/(public)/login/_components/suspended-notice", () => ({
  SuspendedNotice: () => null,
}));

mock.module("@/public/components/design-system/container", () => ({
  Container: ({ children }: { children?: unknown }) => children ?? null,
}));

mock.module("@/public/components/design-system/stack", () => ({
  Stack: ({ children }: { children?: unknown }) => children ?? null,
}));

// =============================================================================
// テスト本体
// =============================================================================

const SUSPENDED_USER = {
  id: "user-suspended",
  email: "suspended@example.com",
  role: "CUSTOMER",
} as const;

const ACTIVE_USER = {
  id: "user-active",
  email: "active@example.com",
  role: "CUSTOMER",
} as const;

/**
 * LoginPage を dynamic import で読み込み、指定した searchParams で呼び出す。
 * next/navigation.redirect の呼び出し履歴のみを検証するので JSX 出力は評価しない。
 */
async function invokeLoginPage(searchParams: Record<string, string>) {
  const mod = await import("@/app/(public)/login/page");
  await mod.default({ searchParams: Promise.resolve(searchParams) });
}

describe("LoginPage — MYPAGE-AUTH-01 redirect guard", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockGetCurrentCustomerUser.mockClear();
  });

  test("suspended user cookie + error=account_suspended → does NOT redirect (breaks the loop)", async () => {
    mockGetCurrentCustomerUser.mockImplementation(() =>
      Promise.resolve(SUSPENDED_USER),
    );

    await invokeLoginPage({ error: "account_suspended" });

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("suspended user cookie + no error query → still redirects to /mypage (MypageAuthGate re-guards)", async () => {
    // MypageAuthGate 側で弾かれる想定なので、LoginPage としては従来通り redirect する。
    // (この分岐が壊れると suspended 顧客が LoginPage に vaild session で滞留してしまう)
    mockGetCurrentCustomerUser.mockImplementation(() =>
      Promise.resolve(SUSPENDED_USER),
    );

    await invokeLoginPage({});

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/mypage");
  });

  test("active user cookie → redirects to /mypage (unchanged behavior)", async () => {
    mockGetCurrentCustomerUser.mockImplementation(() =>
      Promise.resolve(ACTIVE_USER),
    );

    await invokeLoginPage({});

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/mypage");
  });

  test("active user cookie + unrelated error (auth_failed) → redirects to /mypage (only account_suspended is special)", async () => {
    mockGetCurrentCustomerUser.mockImplementation(() =>
      Promise.resolve(ACTIVE_USER),
    );

    await invokeLoginPage({ error: "auth_failed" });

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/mypage");
  });

  test("no session + error=account_suspended → does NOT redirect, renders login form with error notice", async () => {
    mockGetCurrentCustomerUser.mockImplementation(() => Promise.resolve(null));

    await invokeLoginPage({ error: "account_suspended" });

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("no session + no error → does NOT redirect (normal login form)", async () => {
    mockGetCurrentCustomerUser.mockImplementation(() => Promise.resolve(null));

    await invokeLoginPage({});

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
