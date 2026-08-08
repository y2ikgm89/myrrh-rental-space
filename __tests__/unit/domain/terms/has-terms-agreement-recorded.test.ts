/**
 * hasTermsAgreementRecorded — ALL-match idempotency guard
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockAgreementFindMany = mock<() => Promise<Array<{ termsId: string }>>>(
  () => Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsAgreement: { findMany: mockAgreementFindMany },
  },
}));

const { hasTermsAgreementRecorded } =
  await import("@/shared/domain/terms/queries");

beforeEach(() => {
  mockAgreementFindMany.mockReset();
});

describe("hasTermsAgreementRecorded (ALL-match)", () => {
  test("空 termsIds は false（DB アクセスなし）", async () => {
    const result = await hasTermsAgreementRecorded({
      customerId: "c1",
      scope: "LOGIN_SIGNUP",
      termsIds: [],
    });

    expect(result).toBe(false);
    expect(mockAgreementFindMany).not.toHaveBeenCalled();
  });

  test("要求 ID がすべて揃っていれば true", async () => {
    mockAgreementFindMany.mockResolvedValueOnce([
      { termsId: "t1" },
      { termsId: "t2" },
    ]);

    const result = await hasTermsAgreementRecorded({
      customerId: "c1",
      scope: "LOGIN_SIGNUP",
      termsIds: ["t1", "t2"],
    });

    expect(result).toBe(true);
    expect(mockAgreementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: "c1",
          scope: "LOGIN_SIGNUP",
          termsId: { in: ["t1", "t2"] },
        }),
        distinct: ["termsId"],
      }),
    );
  });

  test("1 件でも欠ければ false（部分記録は idempotent とみなさない）", async () => {
    mockAgreementFindMany.mockResolvedValueOnce([{ termsId: "t1" }]);

    const result = await hasTermsAgreementRecorded({
      customerId: "c1",
      scope: "LOGIN_SIGNUP",
      termsIds: ["t1", "t2"],
    });

    expect(result).toBe(false);
  });

  test("重複 termsIds は unique 化して判定する", async () => {
    mockAgreementFindMany.mockResolvedValueOnce([{ termsId: "t1" }]);

    const result = await hasTermsAgreementRecorded({
      customerId: "c1",
      scope: "LOGIN_SIGNUP",
      termsIds: ["t1", "t1"],
    });

    expect(result).toBe(true);
    expect(mockAgreementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          termsId: { in: ["t1"] },
        }),
      }),
    );
  });
});
