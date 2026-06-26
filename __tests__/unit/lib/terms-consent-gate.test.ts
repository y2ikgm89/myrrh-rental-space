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

mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: getRequiredTermsByScopeMock,
}));

mock.module("server-only", () => ({}));

const { assertAllRequiredTermsAgreed } =
  await import("@/shared/lib/terms-consent-gate");

afterEach(() => {
  getRequiredTermsByScopeMock.mockReset();
});

describe("assertAllRequiredTermsAgreed", () => {
  test("required が空のときは validate を通す (no-op)", async () => {
    getRequiredTermsByScopeMock.mockResolvedValueOnce([]);
    const result = await assertAllRequiredTermsAgreed({
      scope: TermsScope.RESERVATION,
      agreedTermsIds: [],
    });
    expect(result.matchedTermsIds).toEqual([]);
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
