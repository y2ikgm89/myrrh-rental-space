/**
 * `isPublicPageUnpublished` — 固定ルート（システムページ）専用の存在/非公開判定クエリ
 *
 * `getPublicPage` は PUBLIC_WHERE（isPublished + isActive）gate のため
 * 「ページ行が存在しない」場合と「行は存在するが isPublished=false」の場合の両方で
 * null を返し、区別できない。固定ルートはこの 2 ケースを区別する必要があるため、
 * この専用クエリで「存在するが非公開」だけを true として切り出す。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("next/cache", () => ({
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

mock.module("server-only", () => ({}));

const pageFindUnique = mock<(_args?: unknown) => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    page: {
      findUnique: (args: unknown) => pageFindUnique(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
mock.module("@/shared/lib/errors/server", () => ({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { isPublicPageUnpublished } =
  await import("@/shared/domain/pages/queries");

function resetAllMocks() {
  pageFindUnique.mockReset();
  pageFindUnique.mockResolvedValue(null);
}

describe("isPublicPageUnpublished", () => {
  beforeEach(resetAllMocks);

  test("ページ行が存在しない（DB未カスタマイズ）→ false（フォールバック対象、404にしない）", async () => {
    pageFindUnique.mockResolvedValue(null);
    expect(await isPublicPageUnpublished("about")).toBe(false);
  });

  test("ページ行が存在し isPublished=true → false", async () => {
    pageFindUnique.mockResolvedValue({ isPublished: true });
    expect(await isPublicPageUnpublished("about")).toBe(false);
  });

  test("ページ行が存在し isPublished=false → true（404対象）", async () => {
    pageFindUnique.mockResolvedValue({ isPublished: false });
    expect(await isPublicPageUnpublished("about")).toBe(true);
  });

  test("不正な slug は DB を引かず false", async () => {
    expect(await isPublicPageUnpublished("")).toBe(false);
    expect(await isPublicPageUnpublished("Invalid Slug!")).toBe(false);
    expect(pageFindUnique).not.toHaveBeenCalled();
  });

  test("isActive: true を where 句に含める（論理削除済みは非公開扱いにしない）", async () => {
    pageFindUnique.mockResolvedValue({ isPublished: false });
    await isPublicPageUnpublished("about");

    const call = pageFindUnique.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ slug: "about", isActive: true });
  });
});
