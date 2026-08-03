/**
 * getReagreeAffectedCustomerCount() のテスト (TERMS-REAGREE-P3B)
 *
 * admin 側 inline warning の元データ。LOGIN_SIGNUP scope の doc について
 * 現状 hash に対する active customer の未同意者数を返す。
 *
 * `TermsAgreement.customerId` は customers への FK を持たない論理参照になったため
 * （証跡テーブルを FK の参照アクションで書き換えさせない。20260803030000 参照）、
 * リレーションフィルタ 1 発ではなく「同意済み customerId を引く → その中の有効顧客を
 * 数える → 総数から引く」の 2 段クエリで同じ値を出す。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createHash } from "node:crypto";

type TermsDocRow = {
  contentHtml: string;
  scopes: string[];
  deletedAt: Date | null;
  isPublished: boolean;
};

const mockTermsDocFindUnique = mock<
  (args: { where: unknown; select?: unknown }) => Promise<TermsDocRow | null>
>(() => Promise.resolve(null));

const mockCustomerCount = mock<(args: { where: unknown }) => Promise<number>>(
  () => Promise.resolve(0),
);

const mockAgreementFindMany = mock<
  (args: {
    where: unknown;
    select?: unknown;
    distinct?: unknown;
  }) => Promise<{ customerId: string | null }[]>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findUnique: mockTermsDocFindUnique },
    customer: { count: mockCustomerCount },
    termsAgreement: { findMany: mockAgreementFindMany },
  },
}));

// eslint-disable-next-line import-x/first
import { getReagreeAffectedCustomerCount } from "@/shared/domain/terms/admin-queries";

const TERMS_ID = "doc-terms";
const CONTENT_HTML = "<p>利用規約 v2</p>";

function sha256(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

function agreedCustomers(count: number): { customerId: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    customerId: `customer-${index}`,
  }));
}

beforeEach(() => {
  mockTermsDocFindUnique.mockReset();
  mockCustomerCount.mockReset();
  mockAgreementFindMany.mockReset();
  mockAgreementFindMany.mockResolvedValue([]);
});

describe("getReagreeAffectedCustomerCount", () => {
  test("doc が存在しなければ全てゼロで返す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce(null);

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result).toEqual({
      affected: 0,
      totalActiveCustomers: 0,
      scopeApplies: false,
    });
    expect(mockCustomerCount).not.toHaveBeenCalled();
    expect(mockAgreementFindMany).not.toHaveBeenCalled();
  });

  test("LOGIN_SIGNUP scope 外の doc は scopeApplies: false + affected: 0", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["RESERVATION"],
      deletedAt: null,
      isPublished: true,
    });
    // totalActiveCustomers の count は scope 外でも呼ばれる (banner UI 側で参照可能)
    mockCustomerCount.mockResolvedValueOnce(1000);

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result).toEqual({
      affected: 0,
      totalActiveCustomers: 1000,
      scopeApplies: false,
    });
    // affected 計算 count は呼ばれない (1 回目 = totalActive のみ)
    expect(mockCustomerCount).toHaveBeenCalledTimes(1);
    expect(mockAgreementFindMany).not.toHaveBeenCalled();
  });

  test("LOGIN_SIGNUP scope 対象で全 active customer が未同意ならその全数を返す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP", "RESERVATION"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(1000); // totalActiveCustomers
    mockAgreementFindMany.mockResolvedValueOnce([]); // 同意者ゼロ

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result).toEqual({
      affected: 1000,
      totalActiveCustomers: 1000,
      scopeApplies: true,
    });
    // 同意者が 0 件なら 2 本目の count を撃たない
    expect(mockCustomerCount).toHaveBeenCalledTimes(1);
  });

  test("一部の active customer が現行 hash で同意済みならその差分を返す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount
      .mockResolvedValueOnce(1000) // totalActiveCustomers
      .mockResolvedValueOnce(700); // 同意済みかつ isActive
    mockAgreementFindMany.mockResolvedValueOnce(agreedCustomers(700));

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result.affected).toBe(300);
    expect(result.totalActiveCustomers).toBe(1000);
    expect(result.scopeApplies).toBe(true);
  });

  test("退会済み（isActive: false）の同意者は差し引かれない", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount
      .mockResolvedValueOnce(1000) // totalActiveCustomers
      .mockResolvedValueOnce(50); // 同意者 200 のうち isActive なのは 50
    mockAgreementFindMany.mockResolvedValueOnce(agreedCustomers(200));

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result.affected).toBe(950);
  });

  test("同意記録の絞り込みに現行 hash + LOGIN_SIGNUP scope を含む", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(500).mockResolvedValueOnce(200);
    mockAgreementFindMany.mockResolvedValueOnce(agreedCustomers(200));

    await getReagreeAffectedCustomerCount(TERMS_ID);

    const agreementCall = mockAgreementFindMany.mock.calls[0]?.[0];
    expect(agreementCall?.where).toMatchObject({
      termsId: TERMS_ID,
      scope: "LOGIN_SIGNUP",
      contentHash: sha256(CONTENT_HTML),
      customerId: { not: null },
    });
    // 同一顧客が複数回同意していても二重に差し引かない
    expect(agreementCall?.distinct).toEqual(["customerId"]);
  });

  test("totalActiveCustomers の where 句は isActive: true のみ", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(500).mockResolvedValueOnce(0);

    await getReagreeAffectedCustomerCount(TERMS_ID);

    const totalCall = mockCustomerCount.mock.calls[0]?.[0];
    expect(totalCall?.where).toEqual({ isActive: true });
  });
});
