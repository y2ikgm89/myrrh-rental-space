/**
 * `assertGuestTokenCustomerGates` — ゲストトークン経路の active/再同意契約。
 *
 * - 紐付き customerId + 有効トークン相当（session 無し）でも BLACKLIST/停止を拒否
 * - session 付き mutation では LOGIN_SIGNUP 再同意 pending を拒否
 * - 証跡/開示系は requireReagreeWhenSession:false で再同意を免除
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

import { DomainError } from "@/shared/domain/domain-error";

mock.module("server-only", () => ({}));

const mockAssertCustomerActive = mock((_customerId: string) =>
  Promise.resolve(undefined as void),
);
const mockAssertLoginSignupReagreed = mock((_customerId: string) =>
  Promise.resolve(undefined as void),
);

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mockAssertCustomerActive,
}));

mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertLoginSignupReagreed: mockAssertLoginSignupReagreed,
}));

const { assertGuestTokenCustomerGates } =
  await import("@/shared/domain/customers/guest-token-gates");

afterEach(() => {
  mockAssertCustomerActive.mockReset();
  mockAssertLoginSignupReagreed.mockReset();
  mockAssertCustomerActive.mockImplementation(() =>
    Promise.resolve(undefined as void),
  );
  mockAssertLoginSignupReagreed.mockImplementation(() =>
    Promise.resolve(undefined as void),
  );
});

describe("assertGuestTokenCustomerGates", () => {
  test("紐付き customerId + session 無し → assertCustomerActive のみ（有効トークン相当でも BLACKLIST を塞ぐ）", async () => {
    await assertGuestTokenCustomerGates({
      resourceCustomerId: "cust-linked",
      sessionCustomerId: null,
    });
    expect(mockAssertCustomerActive).toHaveBeenCalledWith("cust-linked");
    expect(mockAssertLoginSignupReagreed).not.toHaveBeenCalled();
  });

  test("BLACKLIST/停止の resourceCustomerId → DomainError(FORBIDDEN) を伝播", async () => {
    mockAssertCustomerActive.mockImplementationOnce(() =>
      Promise.reject(
        new DomainError(
          "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。",
          "FORBIDDEN",
        ),
      ),
    );

    await expect(
      assertGuestTokenCustomerGates({
        resourceCustomerId: "cust-blacklisted",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockAssertLoginSignupReagreed).not.toHaveBeenCalled();
  });

  test("session + mutation (default) → active のあと reagree を強制", async () => {
    await assertGuestTokenCustomerGates({
      resourceCustomerId: "cust-1",
      sessionCustomerId: "cust-1",
    });
    expect(mockAssertCustomerActive).toHaveBeenCalledWith("cust-1");
    expect(mockAssertLoginSignupReagreed).toHaveBeenCalledWith("cust-1");
  });

  test("再同意 pending session → DomainError(FORBIDDEN) を伝播（mutation curl-bypass 防止）", async () => {
    mockAssertLoginSignupReagreed.mockImplementationOnce(() =>
      Promise.reject(
        new DomainError(
          "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
          "FORBIDDEN",
        ),
      ),
    );

    await expect(
      assertGuestTokenCustomerGates({
        resourceCustomerId: "cust-1",
        sessionCustomerId: "cust-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockAssertCustomerActive).toHaveBeenCalledWith("cust-1");
  });

  test("requireReagreeWhenSession:false → active のみ（証跡/暗証番号開示）", async () => {
    await assertGuestTokenCustomerGates({
      resourceCustomerId: "cust-1",
      sessionCustomerId: "cust-1",
      requireReagreeWhenSession: false,
    });
    expect(mockAssertCustomerActive).toHaveBeenCalledWith("cust-1");
    expect(mockAssertLoginSignupReagreed).not.toHaveBeenCalled();
  });

  test("resourceCustomerId 無し + session 無し → no-op", async () => {
    await assertGuestTokenCustomerGates({
      resourceCustomerId: null,
      sessionCustomerId: null,
    });
    expect(mockAssertCustomerActive).not.toHaveBeenCalled();
    expect(mockAssertLoginSignupReagreed).not.toHaveBeenCalled();
  });

  test("resourceCustomerId 無し + session あり（unclaimed）→ session に active + reagree", async () => {
    await assertGuestTokenCustomerGates({
      resourceCustomerId: null,
      sessionCustomerId: "cust-session",
    });
    expect(mockAssertCustomerActive).toHaveBeenCalledWith("cust-session");
    expect(mockAssertLoginSignupReagreed).toHaveBeenCalledWith("cust-session");
  });
});
