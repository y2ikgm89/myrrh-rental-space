/**
 * `requireSystemPagePublished` — 固定ルート冒頭の 1 行ガード
 *
 * `requireFeatureEnabled` と同型: 対象 slug が「存在するが非公開」なら
 * `notFound()` を throw する。行が存在しない（DB 未カスタマイズの初期状態）場合は
 * 何もしない（呼び出し元の DEFAULT_PAGE_SECTIONS フォールバックが正当な仕様のため）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

class NotFoundError extends Error {}

const mockNotFound = mock((): never => {
  throw new NotFoundError("NEXT_NOT_FOUND");
});

mock.module("next/navigation", () => ({
  notFound: mockNotFound,
}));

const mockIsPublicPageUnpublished = mock<(_slug: string) => Promise<boolean>>(
  () => Promise.resolve(false),
);

mock.module("@/shared/domain/pages/queries", () => ({
  isPublicPageUnpublished: (slug: string) => mockIsPublicPageUnpublished(slug),
}));

const { requireSystemPagePublished } =
  await import("@/shared/domain/pages/require-published-server");

describe("requireSystemPagePublished", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
    mockIsPublicPageUnpublished.mockReset();
    mockIsPublicPageUnpublished.mockResolvedValue(false);
  });

  test("非公開ページ → notFound() を呼ぶ", async () => {
    mockIsPublicPageUnpublished.mockResolvedValue(true);

    await expect(requireSystemPagePublished("about")).rejects.toThrow(
      NotFoundError,
    );

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockIsPublicPageUnpublished).toHaveBeenCalledWith("about");
  });

  test("公開ページ（または DB 未カスタマイズ）→ notFound() を呼ばない", async () => {
    mockIsPublicPageUnpublished.mockResolvedValue(false);

    await expect(requireSystemPagePublished("about")).resolves.toBeUndefined();

    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
