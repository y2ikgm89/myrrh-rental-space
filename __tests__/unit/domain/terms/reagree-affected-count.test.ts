/**
 * getReagreeAffectedCustomerCount() のテスト (TERMS-REAGREE-P3B)
 *
 * admin 側 inline warning の元データ。LOGIN_SIGNUP scope の doc について
 * 現状 hash に対する active customer の未同意者数を返す。
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

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findUnique: mockTermsDocFindUnique },
    customer: { count: mockCustomerCount },
  },
}));

// eslint-disable-next-line import-x/first
import { getReagreeAffectedCustomerCount } from "@/shared/domain/terms/admin-queries";

const TERMS_ID = "doc-terms";
const CONTENT_HTML = "<p>利用規約 v2</p>";

function sha256(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

beforeEach(() => {
  mockTermsDocFindUnique.mockReset();
  mockCustomerCount.mockReset();
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
  });

  test("LOGIN_SIGNUP scope 対象で全 active customer が未同意ならその全数を返す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP", "RESERVATION"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount
      .mockResolvedValueOnce(1000) // totalActiveCustomers
      .mockResolvedValueOnce(1000); // affected (全員未同意)

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result).toEqual({
      affected: 1000,
      totalActiveCustomers: 1000,
      scopeApplies: true,
    });
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
      .mockResolvedValueOnce(300); // affected

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result.affected).toBe(300);
    expect(result.totalActiveCustomers).toBe(1000);
    expect(result.scopeApplies).toBe(true);
  });

  test("affected の where 句に現行 hash + LOGIN_SIGNUP scope を含む", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(500).mockResolvedValueOnce(200);

    await getReagreeAffectedCustomerCount(TERMS_ID);

    const affectedCall = mockCustomerCount.mock.calls[1]?.[0];
    expect(affectedCall?.where).toMatchObject({
      isActive: true,
      NOT: {
        termsAgreements: {
          some: {
            termsId: TERMS_ID,
            scope: "LOGIN_SIGNUP",
            contentHash: sha256(CONTENT_HTML),
          },
        },
      },
    });
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
