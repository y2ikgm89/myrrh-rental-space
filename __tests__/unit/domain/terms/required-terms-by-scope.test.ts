/**
 * getRequiredTermsByScope() の fail-closed テスト
 *
 * 空配列は「必須規約が未設定」の正当値。fetch 失敗を [] に落とすと
 * consent-gate が no-op になり同意をすり抜ける。criticalFetch で throw し、
 * Data Cache に失敗結果を書かない（features.ts と同じ契約）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

type RequiredTermRow = {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
};

const mockFindMany = mock<
  (args: {
    where: unknown;
    orderBy?: unknown;
    select?: unknown;
  }) => Promise<RequiredTermRow[]>
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
    termsDocument: { findMany: mockFindMany },
  },
}));

import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";

beforeEach(() => {
  mockFindMany.mockReset();
});

describe("getRequiredTermsByScope", () => {
  test("DB エラー時は throw し、空配列にフォールバックしない", async () => {
    mockFindMany.mockImplementationOnce(() =>
      Promise.reject(new Error("DB unreachable")),
    );

    await expect(
      getRequiredTermsByScope(TermsScope.RESERVATION),
    ).rejects.toThrow("DB unreachable");
  });
});
