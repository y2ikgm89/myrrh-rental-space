import { describe, test, expect, mock, beforeEach } from "bun:test";

// server-only モジュールと queries のモック（import より前に配置）
mock.module("server-only", () => ({}));

const mockFindSlugConflict = mock<
  (
    slug: string,
    currentType: string,
    currentId?: string,
  ) => Promise<{ contentType: string; id: string } | null>
>(() => Promise.resolve(null));

mock.module("@/shared/domain/slugs/queries", () => ({
  findSlugConflict: (slug: string, currentType: string, currentId?: string) =>
    mockFindSlugConflict(slug, currentType, currentId),
}));

import {
  isReservedPath,
  getReservedPaths,
  getSlugErrorMessage,
  checkSlugAvailability,
  type ContentType,
  type SlugUnavailableReason,
} from "@/shared/lib/slug-validation";

// =============================================================================
// isReservedPath
// =============================================================================

describe("isReservedPath", () => {
  describe("正常系 — 予約済みパスを正しく検出", () => {
    test('"admin" は予約済みパス', () => {
      expect(isReservedPath("admin")).toBe(true);
    });

    test('"api" は予約済みパス', () => {
      expect(isReservedPath("api")).toBe(true);
    });

    test('"_next" は予約済みパス', () => {
      expect(isReservedPath("_next")).toBe(true);
    });

    test('"about" は予約済みパス', () => {
      expect(isReservedPath("about")).toBe(true);
    });

    test('"contact" は予約済みパス', () => {
      expect(isReservedPath("contact")).toBe(true);
    });

    test('"faq" は予約済みパス', () => {
      expect(isReservedPath("faq")).toBe(true);
    });

    test('"news" は予約済みパス', () => {
      expect(isReservedPath("news")).toBe(true);
    });

    test('"reservation" は予約済みパス', () => {
      expect(isReservedPath("reservation")).toBe(true);
    });

    test('"spaces" は予約済みパス', () => {
      expect(isReservedPath("spaces")).toBe(true);
    });

    test('"terms" は予約済みパス', () => {
      expect(isReservedPath("terms")).toBe(true);
    });

    test('"privacy" は予約済みパス', () => {
      expect(isReservedPath("privacy")).toBe(true);
    });

    test('"posts" は予約済みパス', () => {
      expect(isReservedPath("posts")).toBe(true);
    });

    test('"p" は予約済みパス', () => {
      expect(isReservedPath("p")).toBe(true);
    });

    test('"sitemap.xml" は予約済みパス', () => {
      expect(isReservedPath("sitemap.xml")).toBe(true);
    });

    test('"robots.txt" は予約済みパス', () => {
      expect(isReservedPath("robots.txt")).toBe(true);
    });

    test('"favicon.ico" は予約済みパス', () => {
      expect(isReservedPath("favicon.ico")).toBe(true);
    });
  });

  describe("正常系 — 予約済みでないパス", () => {
    test('"my-article" は予約済みでない', () => {
      expect(isReservedPath("my-article")).toBe(false);
    });

    test('"hello-world" は予約済みでない', () => {
      expect(isReservedPath("hello-world")).toBe(false);
    });

    test('"rental-space-tokyo" は予約済みでない', () => {
      expect(isReservedPath("rental-space-tokyo")).toBe(false);
    });
  });

  describe("エッジケース — 大文字小文字の正規化", () => {
    test('"ADMIN" は予約済みパス（大文字→小文字に正規化）', () => {
      expect(isReservedPath("ADMIN")).toBe(true);
    });

    test('"Admin" は予約済みパス（混在→小文字に正規化）', () => {
      expect(isReservedPath("Admin")).toBe(true);
    });

    test('"NEWS" は予約済みパス（大文字→小文字に正規化）', () => {
      expect(isReservedPath("NEWS")).toBe(true);
    });

    test('"FAQ" は予約済みパス（大文字→小文字に正規化）', () => {
      expect(isReservedPath("FAQ")).toBe(true);
    });
  });

  describe("エッジケース — 部分一致は予約済みでない", () => {
    test('"admins" は予約済みでない', () => {
      expect(isReservedPath("admins")).toBe(false);
    });

    test('"api-v1" は予約済みでない', () => {
      expect(isReservedPath("api-v1")).toBe(false);
    });

    test('"my-news" は予約済みでない', () => {
      expect(isReservedPath("my-news")).toBe(false);
    });

    test('"about-us" は予約済みでない', () => {
      expect(isReservedPath("about-us")).toBe(false);
    });
  });

  describe("エッジケース — 空文字・特殊値", () => {
    test('空文字列 "" は予約済みでない', () => {
      expect(isReservedPath("")).toBe(false);
    });
  });
});

// =============================================================================
// getReservedPaths
// =============================================================================

describe("getReservedPaths", () => {
  test("配列を返す", () => {
    const paths = getReservedPaths();
    expect(Array.isArray(paths)).toBe(true);
  });

  test("空でない配列を返す", () => {
    const paths = getReservedPaths();
    expect(paths.length).toBeGreaterThan(0);
  });

  test("ソートされた配列を返す", () => {
    const paths = getReservedPaths();
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  test("既知の予約済みパスが含まれる", () => {
    const paths = getReservedPaths();
    expect(paths).toContain("admin");
    expect(paths).toContain("api");
    expect(paths).toContain("news");
    expect(paths).toContain("about");
    expect(paths).toContain("sitemap.xml");
  });

  test("重複がない", () => {
    const paths = getReservedPaths();
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

// =============================================================================
// getSlugErrorMessage
// =============================================================================

describe("getSlugErrorMessage", () => {
  describe("type: reserved", () => {
    test("予約済みパスのエラーメッセージを返す", () => {
      const reason: SlugUnavailableReason = {
        type: "reserved",
        path: "admin",
      };
      const message = getSlugErrorMessage(reason);
      expect(message).toBe(
        "「admin」はシステムで予約されているため使用できません",
      );
    });

    test("パスが動的に埋め込まれる", () => {
      const reason: SlugUnavailableReason = {
        type: "reserved",
        path: "api",
      };
      const message = getSlugErrorMessage(reason);
      expect(message).toContain("api");
    });
  });

  describe("type: conflict", () => {
    test('"post" 衝突でコンテンツタイプラベル「投稿」を含む', () => {
      const reason: SlugUnavailableReason = {
        type: "conflict",
        contentType: "post",
        id: "post-1",
      };
      expect(getSlugErrorMessage(reason)).toContain("投稿");
    });

    test('"news" 衝突でコンテンツタイプラベル「お知らせ」を含む', () => {
      const reason: SlugUnavailableReason = {
        type: "conflict",
        contentType: "news",
        id: "news-1",
      };
      expect(getSlugErrorMessage(reason)).toContain("お知らせ");
    });

    test('"page" 衝突でコンテンツタイプラベル「ページ」を含む', () => {
      const reason: SlugUnavailableReason = {
        type: "conflict",
        contentType: "page",
        id: "page-1",
      };
      expect(getSlugErrorMessage(reason)).toContain("ページ");
    });

    test('"space" 衝突でコンテンツタイプラベル「スペース」を含む', () => {
      const reason: SlugUnavailableReason = {
        type: "conflict",
        contentType: "space",
        id: "space-1",
      };
      expect(getSlugErrorMessage(reason)).toContain("スペース");
    });
  });
});

// =============================================================================
// checkSlugAvailability
// =============================================================================

describe("checkSlugAvailability", () => {
  beforeEach(() => {
    mockFindSlugConflict.mockReset();
    mockFindSlugConflict.mockResolvedValue(null);
  });

  describe("正常系 — 利用可能なスラッグ", () => {
    test("衝突なしのスラッグは available: true を返す", async () => {
      const result = await checkSlugAvailability("my-article", {
        currentType: "post",
      });
      expect(result.available).toBe(true);
    });

    test("更新時（currentId 指定）で利用可能な場合は available: true を返す", async () => {
      const result = await checkSlugAvailability("my-article", {
        currentType: "post",
        currentId: "post-1",
      });
      expect(result.available).toBe(true);
    });
  });

  describe("異常系 — 予約済みパス", () => {
    test('"admin" は available: false（type: reserved）を返す', async () => {
      const result = await checkSlugAvailability("admin", {
        currentType: "post",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("reserved");
        if (result.reason.type === "reserved") {
          expect(result.reason.path).toBe("admin");
        }
      }
    });

    test('"api" は available: false（type: reserved）を返す', async () => {
      const result = await checkSlugAvailability("api", {
        currentType: "page",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("reserved");
      }
    });

    test("予約済みパスチェックは findSlugConflict を呼ばない", async () => {
      await checkSlugAvailability("admin", { currentType: "post" });
      expect(mockFindSlugConflict).not.toHaveBeenCalled();
    });
  });

  describe("異常系 — スラッグ衝突", () => {
    test("post との衝突で available: false（type: conflict）を返す", async () => {
      mockFindSlugConflict.mockResolvedValue({
        contentType: "post",
        id: "post-existing",
      });

      const result = await checkSlugAvailability("existing-slug", {
        currentType: "page",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("conflict");
        if (result.reason.type === "conflict") {
          expect(result.reason.contentType).toBe("post");
          expect(result.reason.id).toBe("post-existing");
        }
      }
    });

    test("news との衝突で available: false（type: conflict）を返す", async () => {
      mockFindSlugConflict.mockResolvedValue({
        contentType: "news",
        id: "news-existing",
      });

      const result = await checkSlugAvailability("existing-slug", {
        currentType: "post",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("conflict");
        if (result.reason.type === "conflict") {
          expect(result.reason.contentType).toBe("news");
        }
      }
    });

    test("space との衝突で available: false（type: conflict）を返す", async () => {
      mockFindSlugConflict.mockResolvedValue({
        contentType: "space",
        id: "space-existing",
      });

      const result = await checkSlugAvailability("existing-slug", {
        currentType: "page",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("conflict");
        if (result.reason.type === "conflict") {
          expect(result.reason.contentType).toBe("space");
        }
      }
    });
  });

  describe("エッジケース — 大文字小文字の正規化", () => {
    test("大文字スラッグは小文字に正規化して検索される", async () => {
      await checkSlugAvailability("My-Article", { currentType: "post" });
      expect(mockFindSlugConflict).toHaveBeenCalledWith(
        "my-article",
        "post",
        undefined,
      );
    });

    test('"ADMIN" は大文字でも予約済みとして検出される', async () => {
      const result = await checkSlugAvailability("ADMIN", {
        currentType: "post",
      });
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason.type).toBe("reserved");
        if (result.reason.type === "reserved") {
          expect(result.reason.path).toBe("admin");
        }
      }
    });
  });

  describe("エッジケース — currentId の受け渡し", () => {
    test("currentId が渡された場合は findSlugConflict に伝達される", async () => {
      await checkSlugAvailability("my-article", {
        currentType: "post",
        currentId: "post-123",
      });
      expect(mockFindSlugConflict).toHaveBeenCalledWith(
        "my-article",
        "post",
        "post-123",
      );
    });

    test("currentId が未指定の場合は undefined が渡される", async () => {
      await checkSlugAvailability("my-article", { currentType: "post" });
      expect(mockFindSlugConflict).toHaveBeenCalledWith(
        "my-article",
        "post",
        undefined,
      );
    });
  });

  describe("エッジケース — 全コンテンツタイプ", () => {
    const contentTypes: ContentType[] = ["post", "news", "page", "space"];

    for (const type of contentTypes) {
      test(`currentType: "${type}" で問題なく動作する`, async () => {
        const result = await checkSlugAvailability("valid-slug", {
          currentType: type,
        });
        expect(result.available).toBe(true);
      });
    }
  });
});
