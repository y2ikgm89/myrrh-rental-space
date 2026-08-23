/**
 * getReagreeAffectedCustomerCount() のテスト (TERMS-REAGREE-P3B)
 *
 * admin 側 inline warning の元データ。LOGIN_SIGNUP scope の doc について
 * 現状 hash に対する active customer の未同意者数を返す。
 *
 * `TermsAgreement.customerId` は customers への FK を持たない論理参照なので
 * （証跡テーブルを FK の参照アクションで書き換えさせないため）、
 * Prisma のリレーションフィルタは使えない。**NOT EXISTS を 1 本流して DB に数えさせる**
 * （監査 A-35。以前は同意済み id を全件メモリに載せて巨大な `IN (...)` に組み直していた）。
 *
 * SQL そのものの意味は実 DB の integration テスト
 * （`__tests__/integration/domain/terms/reagree-affected-count.test.ts`）が見る。
 * ここは早期リターンの分岐と配線だけ。
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

const mockQueryRaw = mock<
  (...args: unknown[]) => Promise<{ affected: bigint }[]>
>(() => Promise.resolve([{ affected: 0n }]));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findUnique: mockTermsDocFindUnique },
    customer: { count: mockCustomerCount },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import { getReagreeAffectedCustomerCount } from "@/shared/domain/terms/admin-queries";

const TERMS_ID = "doc-terms";
const CONTENT_HTML = "<p>利用規約 v2</p>";

function sha256(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

beforeEach(() => {
  mockTermsDocFindUnique.mockReset();
  mockCustomerCount.mockReset();
  mockQueryRaw.mockReset();
  mockQueryRaw.mockResolvedValue([{ affected: 0n }]);
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
    expect(mockQueryRaw).not.toHaveBeenCalled();
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
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  test("affected は NOT EXISTS の count をそのまま返す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP", "RESERVATION"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(1000);
    mockQueryRaw.mockResolvedValueOnce([{ affected: 300n }]);

    const result = await getReagreeAffectedCustomerCount(TERMS_ID);

    expect(result).toEqual({
      affected: 300,
      totalActiveCustomers: 1000,
      scopeApplies: true,
    });
    // 同意済み数を引くための 2 本目の count は打たない（監査 A-35）。
    expect(mockCustomerCount).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  test("NOT EXISTS に現行 hash / LOGIN_SIGNUP scope / termsId を渡す", async () => {
    mockTermsDocFindUnique.mockResolvedValueOnce({
      contentHtml: CONTENT_HTML,
      scopes: ["LOGIN_SIGNUP"],
      deletedAt: null,
      isPublished: true,
    });
    mockCustomerCount.mockResolvedValueOnce(500);
    mockQueryRaw.mockResolvedValueOnce([{ affected: 300n }]);

    await getReagreeAffectedCustomerCount(TERMS_ID);

    // tagged template の値部分（第 2 引数以降）。
    const values = mockQueryRaw.mock.calls[0]?.slice(1);
    expect(values).toEqual([TERMS_ID, "LOGIN_SIGNUP", sha256(CONTENT_HTML)]);
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
