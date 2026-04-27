import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockBulkToggleActiveCouponsCommand = mock<
  (
    ids: string[],
    isActive: boolean,
  ) => Promise<{
    count: number;
    isActive: boolean;
    affectedIds: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    isActive: true,
    affectedIds: [],
  }),
);

const mockBulkDeleteCouponsCommand = mock<
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

mock.module("@/shared/domain/coupons/bulk-commands", () => ({
  bulkToggleActiveCouponsCommand: mockBulkToggleActiveCouponsCommand,
  bulkDeleteCouponsCommand: mockBulkDeleteCouponsCommand,
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

const { bulkToggleActiveCoupons, bulkDeleteCoupons } =
  await import("@/admin/actions/coupon/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Fixtures
// =============================================================================

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

// =============================================================================
// bulkToggleActiveCoupons
// =============================================================================

describe("bulkToggleActiveCoupons", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkToggleActiveCouponsCommand.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkToggleActiveCoupons([], true);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkToggleActiveCoupons(
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

      const result = await bulkToggleActiveCoupons(ids, true);

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
      mockBulkToggleActiveCouponsCommand.mockResolvedValueOnce({
        count: 100,
        isActive: true,
        affectedIds: ids,
      });

      const result = await bulkToggleActiveCoupons(ids, true);

      expect(isMutationError(result)).toBe(false);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("正常系", () => {
    test("isActive: true で executeAdminMutationResult が resource: coupon, action: update で呼ばれる", async () => {
      mockBulkToggleActiveCouponsCommand.mockResolvedValueOnce({
        count: 2,
        isActive: true,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      const result = await bulkToggleActiveCoupons(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "coupon",
          action: "update",
        }),
      );
      expect(mockBulkToggleActiveCouponsCommand).toHaveBeenCalledWith(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );
      expect(result).toMatchObject({ count: 2, isActive: true });
    });

    test("isActive: false で domain command に false が渡る", async () => {
      mockBulkToggleActiveCouponsCommand.mockResolvedValueOnce({
        count: 1,
        isActive: false,
        affectedIds: [VALID_UUID_A],
      });

      await bulkToggleActiveCoupons([VALID_UUID_A], false);

      expect(mockBulkToggleActiveCouponsCommand).toHaveBeenCalledWith(
        [VALID_UUID_A],
        false,
      );
    });
  });
});

// =============================================================================
// bulkDeleteCoupons
// =============================================================================

describe("bulkDeleteCoupons", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkDeleteCouponsCommand.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error", async () => {
      const result = await bulkDeleteCoupons([]);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("100件超は validation error", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });

      const result = await bulkDeleteCoupons(ids);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: coupon, action: delete で呼ばれる", async () => {
      mockBulkDeleteCouponsCommand.mockResolvedValueOnce({
        count: 2,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      const result = await bulkDeleteCoupons([VALID_UUID_A, VALID_UUID_B]);

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "coupon",
          action: "delete",
        }),
      );
      expect(mockBulkDeleteCouponsCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
        VALID_UUID_B,
      ]);
      expect(result).toMatchObject({ count: 2 });
    });
  });
});
