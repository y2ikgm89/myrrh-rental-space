import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockBulkTogglePublishedSpacesCommand = mock<
  (
    ids: string[],
    publish: boolean,
  ) => Promise<{
    count: number;
    isPublished: boolean;
    affectedIds: string[];
    affectedSlugs: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    isPublished: true,
    affectedIds: [],
    affectedSlugs: [],
  }),
);

const mockBulkDeleteSpacesCommand = mock<
  (ids: string[]) => Promise<{
    count: number;
    skipped: number;
    affectedIds: string[];
    affectedSlugs: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    skipped: 0,
    affectedIds: [],
    affectedSlugs: [],
  }),
);

mock.module("@/shared/domain/spaces/bulk-commands", () => ({
  bulkTogglePublishedSpacesCommand: mockBulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand: mockBulkDeleteSpacesCommand,
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

// purgeSpaceCache は呼び出されるが副作用なし
const mockPurgeSpaceCache = mock<() => Promise<{ success: boolean }>>(() =>
  Promise.resolve({ success: true }),
);
mock.module("@/shared/lib/cloudflare", () => ({
  purgeSpaceCache: mockPurgeSpaceCache,
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkTogglePublishedSpaces, bulkDeleteSpaces } =
  await import("@/admin/actions/space/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Fixtures
// =============================================================================

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

// =============================================================================
// bulkTogglePublishedSpaces
// =============================================================================

describe("bulkTogglePublishedSpaces", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkTogglePublishedSpacesCommand.mockClear();
    mockFireAndForget.mockClear();
    mockPurgeSpaceCache.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkTogglePublishedSpaces([], true);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkTogglePublishedSpaces(
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

      const result = await bulkTogglePublishedSpaces(ids, true);

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
      mockBulkTogglePublishedSpacesCommand.mockResolvedValueOnce({
        count: 100,
        isPublished: true,
        affectedIds: ids,
        affectedSlugs: ids.map((_, i) => `slug-${i}`),
      });

      const result = await bulkTogglePublishedSpaces(ids, true);

      expect(isMutationError(result)).toBe(false);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("正常系", () => {
    test("publish: true で executeAdminMutationResult が resource: space, action: publish で呼ばれる", async () => {
      mockBulkTogglePublishedSpacesCommand.mockResolvedValueOnce({
        count: 2,
        isPublished: true,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
        affectedSlugs: ["space-a", "space-b"],
      });

      const result = await bulkTogglePublishedSpaces(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "space",
          action: "publish",
        }),
      );
      expect(mockBulkTogglePublishedSpacesCommand).toHaveBeenCalledWith(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );
      expect(result).toMatchObject({ count: 2, isPublished: true });
    });

    test("publish: false で domain command に false が渡る", async () => {
      mockBulkTogglePublishedSpacesCommand.mockResolvedValueOnce({
        count: 1,
        isPublished: false,
        affectedIds: [VALID_UUID_A],
        affectedSlugs: ["space-a"],
      });

      await bulkTogglePublishedSpaces([VALID_UUID_A], false);

      expect(mockBulkTogglePublishedSpacesCommand).toHaveBeenCalledWith(
        [VALID_UUID_A],
        false,
      );
    });

    test("afterSuccess で fireAndForget(purgeSpaceCache) が呼ばれる", async () => {
      mockBulkTogglePublishedSpacesCommand.mockResolvedValueOnce({
        count: 2,
        isPublished: true,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
        affectedSlugs: ["space-a", "space-b"],
      });

      await bulkTogglePublishedSpaces([VALID_UUID_A, VALID_UUID_B], true);

      // 2 ids → 2 fireAndForget(purgeSpaceCache) calls
      expect(mockFireAndForget).toHaveBeenCalledTimes(2);
    });
  });
});

// =============================================================================
// bulkDeleteSpaces
// =============================================================================

describe("bulkDeleteSpaces", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkDeleteSpacesCommand.mockClear();
    mockFireAndForget.mockClear();
    mockPurgeSpaceCache.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error", async () => {
      const result = await bulkDeleteSpaces([]);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("100件超は validation error", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });

      const result = await bulkDeleteSpaces(ids);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: space, action: delete で呼ばれる", async () => {
      mockBulkDeleteSpacesCommand.mockResolvedValueOnce({
        count: 2,
        skipped: 0,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
        affectedSlugs: ["space-a", "space-b"],
      });

      const result = await bulkDeleteSpaces([VALID_UUID_A, VALID_UUID_B]);

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "space",
          action: "delete",
        }),
      );
      expect(mockBulkDeleteSpacesCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
        VALID_UUID_B,
      ]);
      expect(result).toMatchObject({ count: 2, skipped: 0 });
    });

    test("FK 制約 skipped を含む結果がそのまま返る", async () => {
      mockBulkDeleteSpacesCommand.mockResolvedValueOnce({
        count: 1,
        skipped: 1,
        affectedIds: [VALID_UUID_A],
        affectedSlugs: ["space-a"],
      });

      const result = await bulkDeleteSpaces([VALID_UUID_A, VALID_UUID_B]);

      expect(result).toMatchObject({ count: 1, skipped: 1 });
    });

    test("afterSuccess で削除成功 ids 分だけ fireAndForget が呼ばれる", async () => {
      mockBulkDeleteSpacesCommand.mockResolvedValueOnce({
        count: 1,
        skipped: 1,
        affectedIds: [VALID_UUID_A], // skipped の VALID_UUID_B は含まれない
        affectedSlugs: ["space-a"],
      });

      await bulkDeleteSpaces([VALID_UUID_A, VALID_UUID_B]);

      // 1 affectedId → 1 fireAndForget(purgeSpaceCache)
      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });
  });
});
