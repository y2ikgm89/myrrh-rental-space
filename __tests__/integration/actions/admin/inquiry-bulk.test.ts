import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockBulkDeleteInquiriesCommand = mock<
  (ids: string[]) => Promise<{
    count: number;
    affectedIds: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    affectedIds: [],
  }),
);

mock.module("@/shared/domain/inquiries/bulk-commands", () => ({
  bulkDeleteInquiriesCommand: mockBulkDeleteInquiriesCommand,
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
const noopPurge = (): Promise<{ success: boolean }> =>
  Promise.resolve({ success: true });
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(noopPurge),
  purgeCloudflareCacheByPrefix: mock(noopPurge),
  purgeAllCloudflareCache: mock(noopPurge),
  purgeCloudflareByPaths: mock(noopPurge),
  purgeSpaceCache: mock(noopPurge),
  purgePostCache: mock(noopPurge),
  purgeNewsCache: mock(noopPurge),
  purgePageCache: mock(noopPurge),
  purgeHomeCache: mock(noopPurge),
  purgeFaqCache: mock(noopPurge),
  purgeTermsCache: mock(noopPurge),
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkDeleteInquiries } = await import("@/admin/actions/inquiry/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Fixtures
// =============================================================================

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

// =============================================================================
// bulkDeleteInquiries
// =============================================================================

describe("bulkDeleteInquiries", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkDeleteInquiriesCommand.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkDeleteInquiries([]);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkDeleteInquiries(["not-a-uuid", VALID_UUID_A]);

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

      const result = await bulkDeleteInquiries(ids);

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
      mockBulkDeleteInquiriesCommand.mockResolvedValueOnce({
        count: 100,
        affectedIds: ids,
      });

      const result = await bulkDeleteInquiries(ids);

      expect(isMutationError(result)).toBe(false);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: inquiry, action: delete で呼ばれる", async () => {
      mockBulkDeleteInquiriesCommand.mockResolvedValueOnce({
        count: 2,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      const result = await bulkDeleteInquiries([VALID_UUID_A, VALID_UUID_B]);

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "inquiry",
          action: "delete",
        }),
      );
      expect(mockBulkDeleteInquiriesCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
        VALID_UUID_B,
      ]);
      expect(result).toMatchObject({ count: 2 });
    });

    test("単一件削除も成功する", async () => {
      mockBulkDeleteInquiriesCommand.mockResolvedValueOnce({
        count: 1,
        affectedIds: [VALID_UUID_A],
      });

      const result = await bulkDeleteInquiries([VALID_UUID_A]);

      expect(result).toMatchObject({ count: 1 });
      expect(mockBulkDeleteInquiriesCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
      ]);
    });
  });
});
