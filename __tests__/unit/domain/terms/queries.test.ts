/**
 * getPublishedTermsByType() のテスト
 *
 * type に一意制約が無いため、同一 type の文書が複数存在する場合は
 * displayOrder 昇順の先頭を返す（tie-break の向きを固定する回帰テスト）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type TermsDocRow = {
  id: string;
  type: string;
  slug: string;
  title: string;
  publishedAt: Date | null;
  showInFooter: boolean;
  displayOrder: number;
  updatedAt: Date;
};

const mockFindFirst = mock<
  (args: {
    where: { type?: string };
    orderBy?: unknown;
  }) => Promise<TermsDocRow | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findFirst: mockFindFirst },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";

const CANCELLATION_DOC: TermsDocRow = {
  id: "doc-1",
  type: "cancellation",
  slug: "cancellation-policy",
  title: "キャンセルポリシー",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  showInFooter: true,
  displayOrder: 2,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  mockFindFirst.mockReset();
});

describe("getPublishedTermsByType", () => {
  test("該当 type の公開文書があればそれを返す", async () => {
    mockFindFirst.mockResolvedValueOnce(CANCELLATION_DOC);

    const result = await getPublishedTermsByType("cancellation");

    expect(result?.slug).toBe("cancellation-policy");
    expect(result?.title).toBe("キャンセルポリシー");
  });

  test("該当 type の公開文書が無ければ null を返す", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await getPublishedTermsByType("cancellation");

    expect(result).toBeNull();
  });

  test("where 句に PUBLIC_WHERE（deletedAt:null, isPublished:true）と type を渡す", async () => {
    mockFindFirst.mockResolvedValueOnce(CANCELLATION_DOC);

    await getPublishedTermsByType("cancellation");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          isPublished: true,
          type: "cancellation",
        }),
      }),
    );
  });

  test("displayOrder 昇順・title 昇順でオーダーする（複数該当時の tie-break）", async () => {
    mockFindFirst.mockResolvedValueOnce(CANCELLATION_DOC);

    await getPublishedTermsByType("cancellation");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
      }),
    );
  });

  test("DB エラー時は null にフォールバックする（safeFetch 経由）", async () => {
    mockFindFirst.mockImplementationOnce(() =>
      Promise.reject(new Error("DB unreachable")),
    );

    const result = await getPublishedTermsByType("cancellation");

    expect(result).toBeNull();
  });
});
