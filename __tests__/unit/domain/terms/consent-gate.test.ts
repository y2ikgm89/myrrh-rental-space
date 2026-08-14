import { afterEach, describe, expect, mock, test } from "bun:test";

import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

const getRequiredTermsByScopeMock =
  mock<
    (
      scope: TermsScope,
    ) => Promise<
      Array<{ id: string; slug: string; title: string; contentHtml: string }>
    >
  >();

const getReagreeRequiredTermsForCustomerMock =
  mock<
    (
      customerId: string,
    ) => Promise<
      Array<{ id: string; slug: string; title: string; contentHtml: string }>
    >
  >();

mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: getRequiredTermsByScopeMock,
  getReagreeRequiredTermsForCustomer: getReagreeRequiredTermsForCustomerMock,
}));

mock.module("server-only", () => ({}));

const { assertAllRequiredTermsAgreed, assertLoginSignupReagreed } =
  await import("@/shared/domain/terms/consent-gate");

afterEach(() => {
  getRequiredTermsByScopeMock.mockReset();
  getReagreeRequiredTermsForCustomerMock.mockReset();
});

describe("assertAllRequiredTermsAgreed", () => {
  test("必須規約が未設定（query が空配列）のときは validate を通す (no-op)", async () => {
    // 空配列は「規約未設定」の正当値。fetch 失敗は query が throw する
    // （required-terms-by-scope.test.ts）。ここでは未設定だけを意味する。
    getRequiredTermsByScopeMock.mockResolvedValueOnce([]);
    const result = await assertAllRequiredTermsAgreed({
      scope: TermsScope.RESERVATION,
      agreedTermsIds: [],
    });
    expect(result.matchedTermsIds).toEqual([]);
  });

  test("getRequiredTermsByScope の例外は握らず伝播する", async () => {
    getRequiredTermsByScopeMock.mockRejectedValueOnce(
      new Error("DB unreachable"),
    );
    await expect(
      assertAllRequiredTermsAgreed({
        scope: TermsScope.RESERVATION,
        agreedTermsIds: [],
      }),
    ).rejects.toThrow("DB unreachable");
  });

  test("client が全 required を網羅していれば通す (subset 一致)", async () => {
    getRequiredTermsByScopeMock.mockResolvedValueOnce([
      { id: "a", slug: "terms-of-use", title: "T1", contentHtml: "" },
      { id: "b", slug: "privacy", title: "T2", contentHtml: "" },
    ]);

    const result = await assertAllRequiredTermsAgreed({
      scope: TermsScope.RESERVATION,
      // ID 順不同 + 余分な ID 混入 OK (subset 検査)
      agreedTermsIds: ["x", "b", "a"],
    });
    expect(result.matchedTermsIds.sort()).toEqual(["a", "b"]);
  });

  test("required の一部が欠けると DomainError(VALIDATION) を throw", async () => {
    getRequiredTermsByScopeMock.mockResolvedValueOnce([
      { id: "a", slug: "terms-of-use", title: "T1", contentHtml: "" },
      { id: "b", slug: "privacy", title: "T2", contentHtml: "" },
    ]);

    await expect(
      assertAllRequiredTermsAgreed({
        scope: TermsScope.RESERVATION,
        agreedTermsIds: ["a"], // b が抜けている
      }),
    ).rejects.toThrow("すべての必須規約への同意が必要です");
  });

  test("scope 引数が getRequiredTermsByScope にそのまま伝わる", async () => {
    getRequiredTermsByScopeMock.mockResolvedValueOnce([]);
    await assertAllRequiredTermsAgreed({
      scope: TermsScope.EVENT_REGISTRATION,
      agreedTermsIds: [],
    });
    expect(getRequiredTermsByScopeMock).toHaveBeenCalledWith(
      TermsScope.EVENT_REGISTRATION,
    );
  });
});

describe("assertLoginSignupReagreed", () => {
  test("pending が空なら no-op (throw しない)", async () => {
    getReagreeRequiredTermsForCustomerMock.mockResolvedValueOnce([]);
    await assertLoginSignupReagreed("cus-1");
    expect(getReagreeRequiredTermsForCustomerMock).toHaveBeenCalledWith(
      "cus-1",
    );
  });

  test("pending > 0 なら DomainError(FORBIDDEN) を throw", async () => {
    getReagreeRequiredTermsForCustomerMock.mockResolvedValueOnce([
      {
        id: "doc-terms",
        slug: "terms-of-use",
        title: "利用規約",
        contentHtml: "<p>v2</p>",
      },
    ]);
    await expect(assertLoginSignupReagreed("cus-1")).rejects.toThrow(
      /マイページで再同意/,
    );
  });

  test("error message に /mypage/terms/reagree の誘導パスを含む", async () => {
    getReagreeRequiredTermsForCustomerMock.mockResolvedValueOnce([
      {
        id: "doc-terms",
        slug: "terms-of-use",
        title: "T",
        contentHtml: "",
      },
    ]);
    try {
      await assertLoginSignupReagreed("cus-1");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("/mypage/terms/reagree");
    }
  });
});
