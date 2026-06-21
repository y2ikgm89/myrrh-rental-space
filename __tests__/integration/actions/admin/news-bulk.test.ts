import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockBulkTogglePublishedNewsCommand = mock<
  (
    ids: string[],
    publish: boolean,
  ) => Promise<{
    count: number;
    isPublished: boolean;
    affectedSlugs: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    isPublished: true,
    affectedSlugs: [],
  }),
);

const mockBulkDeleteNewsCommand = mock<
  (ids: string[]) => Promise<{
    count: number;
    affectedSlugs: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    affectedSlugs: [],
  }),
);

mock.module("@/shared/domain/news/bulk-commands", () => ({
  bulkTogglePublishedNewsCommand: mockBulkTogglePublishedNewsCommand,
  bulkDeleteNewsCommand: mockBulkDeleteNewsCommand,
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin-user-id", role: "ADMIN" });
  if (opts.afterSuccess) {
    await opts.afterSuccess(data);
  }
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

// next/cache (updateTag は no-op)
mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

// fireAndForget は同期的に呼び出すだけのスタブ
const mockFireAndForget = mock<(p: Promise<unknown>) => void>(() => {
  // intentionally no-op (do not await)
});
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

// cloudflare module: 全 export をスタブ化してバッチ実行時の他テスト汚染を防ぐ
const mockPurgeDetailUrls = mock<
  (paths: readonly string[]) => Promise<{ success: boolean }>
>(async () => ({ success: true }));
const mockPurgeByTags = mock<(tags: string[]) => Promise<{ success: boolean }>>(
  async () => ({ success: true }),
);
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(async () => ({ success: true })),
  purgeAllCloudflareCache: mock(async () => ({ success: true })),
  purgeCloudflareByPaths: mock(async () => ({ success: true })),
  purgeCloudflareDetailUrls: mockPurgeDetailUrls,
  purgeCloudflareCacheByTags: mockPurgeByTags,
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkTogglePublishedNews, bulkDeleteNews } =
  await import("@/admin/actions/news/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Fixtures
// =============================================================================

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

// (success-narrowing は各テスト内で if (isMutationError(...)) early-throw で実施)

// =============================================================================
// bulkTogglePublishedNews
// =============================================================================

describe("bulkTogglePublishedNews", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkTogglePublishedNewsCommand.mockClear();
    mockFireAndForget.mockClear();
    mockPurgeDetailUrls.mockClear();
    mockPurgeByTags.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkTogglePublishedNews([], true);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkTogglePublishedNews(
        ["not-a-uuid", VALID_UUID_A],
        true,
      );

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("100件超は validation error", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });

      const result = await bulkTogglePublishedNews(ids, true);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("ちょうど 100件は validation 通過", async () => {
      const ids = Array.from({ length: 100 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });
      mockBulkTogglePublishedNewsCommand.mockResolvedValueOnce({
        count: 100,
        isPublished: true,
        affectedSlugs: ids.map((_, i) => `news-slug-${i}`),
      });

      const result = await bulkTogglePublishedNews(ids, true);

      expect(isMutationError(result)).toBe(false);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("正常系", () => {
    test("publish: true で executeAdminMutationResult が resource: news, action: publish で呼ばれる", async () => {
      mockBulkTogglePublishedNewsCommand.mockResolvedValueOnce({
        count: 2,
        isPublished: true,
        affectedSlugs: ["news-a", "news-b"],
      });

      const result = await bulkTogglePublishedNews(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "news",
          action: "publish",
        }),
      );
      expect(mockBulkTogglePublishedNewsCommand).toHaveBeenCalledWith(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );
      if (isMutationError(result)) {
        throw new Error(`expected success but got error: ${result.error}`);
      }
      expect(result.count).toBe(2);
      expect(result.isPublished).toBe(true);
    });

    test("publish: false で domain command に false が渡る", async () => {
      mockBulkTogglePublishedNewsCommand.mockResolvedValueOnce({
        count: 1,
        isPublished: false,
        affectedSlugs: ["news-a"],
      });

      await bulkTogglePublishedNews([VALID_UUID_A], false);

      expect(mockBulkTogglePublishedNewsCommand).toHaveBeenCalledWith(
        [VALID_UUID_A],
        false,
      );
    });

    test("afterSuccess で fireAndForget(purgeCloudflareDetailUrls) が news slug 群を渡す", async () => {
      mockBulkTogglePublishedNewsCommand.mockResolvedValueOnce({
        count: 2,
        isPublished: true,
        affectedSlugs: ["news-a", "news-b"],
      });

      await bulkTogglePublishedNews([VALID_UUID_A, VALID_UUID_B], true);

      expect(mockPurgeDetailUrls).toHaveBeenCalledTimes(1);
      const paths = mockPurgeDetailUrls.mock.calls[0]![0] as readonly string[];
      expect(paths).toEqual(
        expect.arrayContaining(["/news/news-a", "/news/news-b"]),
      );
    });
  });
});

// =============================================================================
// bulkDeleteNews
// =============================================================================

describe("bulkDeleteNews", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkDeleteNewsCommand.mockClear();
    mockFireAndForget.mockClear();
    mockPurgeDetailUrls.mockClear();
    mockPurgeByTags.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error", async () => {
      const result = await bulkDeleteNews([]);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("100件超は validation error", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });

      const result = await bulkDeleteNews(ids);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: news, action: delete で呼ばれる", async () => {
      mockBulkDeleteNewsCommand.mockResolvedValueOnce({
        count: 2,
        affectedSlugs: ["news-a", "news-b"],
      });

      const result = await bulkDeleteNews([VALID_UUID_A, VALID_UUID_B]);

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "news",
          action: "delete",
        }),
      );
      expect(mockBulkDeleteNewsCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
        VALID_UUID_B,
      ]);
      if (isMutationError(result)) {
        throw new Error(`expected success but got error: ${result.error}`);
      }
      expect(result.count).toBe(2);
    });

    test("afterSuccess で削除成功 slug が CF detail URL purge に渡る", async () => {
      mockBulkDeleteNewsCommand.mockResolvedValueOnce({
        count: 1,
        affectedSlugs: ["news-a"],
      });

      await bulkDeleteNews([VALID_UUID_A, VALID_UUID_B]);

      expect(mockPurgeDetailUrls).toHaveBeenCalledTimes(1);
      const paths = mockPurgeDetailUrls.mock.calls[0]![0] as readonly string[];
      expect(paths).toEqual(expect.arrayContaining(["/news/news-a"]));
    });
  });
});
