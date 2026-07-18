/**
 * getReagreeRequiredTermsForCustomer() のテスト
 *
 * LOGIN_SIGNUP scope の必須規約について、顧客の最新 TermsAgreement.contentHash と
 * 現行 TermsDocument.contentHtml の sha256 を比較し、差分がある doc のみ返すことを
 * 検証する。既存 queries.test.ts の mock パターン (prisma facade を module mock) を踏襲。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createHash } from "node:crypto";

type TermsDocRow = {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
};
type AgreementRow = {
  termsId: string;
  contentHash: string;
  contentSnapshot: string;
};

const mockTermsDocFindMany = mock<
  (args: {
    where: unknown;
    orderBy?: unknown;
    select?: unknown;
  }) => Promise<TermsDocRow[]>
>(() => Promise.resolve([]));

const mockTermsAgreementFindMany = mock<
  (args: {
    where: unknown;
    orderBy?: unknown;
    distinct?: unknown;
    select?: unknown;
  }) => Promise<AgreementRow[]>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findMany: mockTermsDocFindMany },
    termsAgreement: { findMany: mockTermsAgreementFindMany },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { getReagreeRequiredTermsForCustomer } from "@/shared/domain/terms/queries";

const CUSTOMER_ID = "cus-1";

const TERMS_OF_USE: TermsDocRow = {
  id: "doc-terms",
  slug: "terms-of-use",
  title: "利用規約",
  contentHtml: "<p>利用規約 v1</p>",
};
const PRIVACY_POLICY: TermsDocRow = {
  id: "doc-privacy",
  slug: "privacy-policy",
  title: "プライバシーポリシー",
  contentHtml: "<p>プライバシーポリシー v1</p>",
};

function sha256(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

beforeEach(() => {
  mockTermsDocFindMany.mockReset();
  mockTermsAgreementFindMany.mockReset();
});

describe("getReagreeRequiredTermsForCustomer", () => {
  test("必須 doc が 0 件なら空配列 (agreement クエリも走らない)", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result).toEqual([]);
    expect(mockTermsAgreementFindMany).not.toHaveBeenCalled();
  });

  test("agreement 未存在ならすべての必須 doc を返す", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE, PRIVACY_POLICY]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result.map((r) => r.id)).toEqual([
      TERMS_OF_USE.id,
      PRIVACY_POLICY.id,
    ]);
  });

  test("全 doc の hash 一致なら空配列", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE, PRIVACY_POLICY]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([
      {
        termsId: TERMS_OF_USE.id,
        contentHash: sha256(TERMS_OF_USE.contentHtml),
        contentSnapshot: TERMS_OF_USE.contentHtml,
      },
      {
        termsId: PRIVACY_POLICY.id,
        contentHash: sha256(PRIVACY_POLICY.contentHtml),
        contentSnapshot: PRIVACY_POLICY.contentHtml,
      },
    ]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result).toEqual([]);
  });

  test("1 doc の hash 不一致ならその doc のみ返す (版違い検出)", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE, PRIVACY_POLICY]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([
      {
        termsId: TERMS_OF_USE.id,
        contentHash: "outdated-hash",
        contentSnapshot: "<p>利用規約 v0 (旧版)</p>",
      },
      {
        termsId: PRIVACY_POLICY.id,
        contentHash: sha256(PRIVACY_POLICY.contentHtml),
        contentSnapshot: PRIVACY_POLICY.contentHtml,
      },
    ]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result.map((r) => r.id)).toEqual([TERMS_OF_USE.id]);
  });

  test("片方だけ agreement 存在で他方は未同意 → 未同意 doc も pending に含まれる", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE, PRIVACY_POLICY]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([
      {
        termsId: TERMS_OF_USE.id,
        contentHash: sha256(TERMS_OF_USE.contentHtml),
        contentSnapshot: TERMS_OF_USE.contentHtml,
      },
    ]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result.map((r) => r.id)).toEqual([PRIVACY_POLICY.id]);
  });

  test("agreement クエリの where 句に customerId + scope=LOGIN_SIGNUP + termsId in list が入る", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE, PRIVACY_POLICY]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([]);

    await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    const call = mockTermsAgreementFindMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      customerId: CUSTOMER_ID,
      scope: "LOGIN_SIGNUP",
      termsId: { in: [TERMS_OF_USE.id, PRIVACY_POLICY.id] },
    });
    expect(call?.orderBy).toEqual({ agreedAt: "desc" });
    expect(call?.distinct).toEqual(["termsId"]);
    // Phase 3.A: contentSnapshot も select する
    expect(call?.select).toMatchObject({
      termsId: true,
      contentHash: true,
      contentSnapshot: true,
    });
  });

  // Phase 3.A (TERMS-REAGREE-P3A): previousSnapshot の埋め込み挙動
  test("版違い doc の previousSnapshot に前回同意した contentSnapshot が入る", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([
      {
        termsId: TERMS_OF_USE.id,
        contentHash: "outdated-hash",
        contentSnapshot: "<p>利用規約 v0 (旧版)</p>",
      },
    ]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result[0]?.previousSnapshot).toBe("<p>利用規約 v0 (旧版)</p>");
  });

  test("未同意 (agreement 無し) doc の previousSnapshot は null", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([TERMS_OF_USE]);
    mockTermsAgreementFindMany.mockResolvedValueOnce([]);

    const result = await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    expect(result[0]?.previousSnapshot).toBeNull();
  });

  test("doc クエリの where 句に isPublished + deletedAt:null + scopes has LOGIN_SIGNUP が入る", async () => {
    mockTermsDocFindMany.mockResolvedValueOnce([]);

    await getReagreeRequiredTermsForCustomer(CUSTOMER_ID);

    const call = mockTermsDocFindMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      deletedAt: null,
      isPublished: true,
      scopes: { has: "LOGIN_SIGNUP" },
    });
  });
});
