import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockBulkToggleActiveCustomersCommand = mock<
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

const mockBulkDeleteCustomersCommand = mock<
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

const mockBulkSetStatusCustomersCommand = mock<
  (
    ids: string[],
    newStatus: CustomerStatus,
  ) => Promise<{
    count: number;
    newStatus: CustomerStatus;
    affectedIds: string[];
    rejectedIds: string[];
  }>
>(() =>
  Promise.resolve({
    count: 0,
    newStatus: CustomerStatus.NEW,
    affectedIds: [],
    rejectedIds: [],
  }),
);

mock.module("@/shared/domain/customers/bulk-commands", () => ({
  bulkToggleActiveCustomersCommand: mockBulkToggleActiveCustomersCommand,
  bulkDeleteCustomersCommand: mockBulkDeleteCustomersCommand,
}));

mock.module("@/shared/domain/customers/bulk-status-commands", () => ({
  bulkSetStatusCustomersCommand: mockBulkSetStatusCustomersCommand,
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
const mockUpdateTag = mock<(tag: string) => void>(() => {});
mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
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
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(async () => ({ success: true })),
  purgeAllCloudflareCache: mock(async () => ({ success: true })),
  purgeCloudflareByPaths: mock(async () => ({ success: true })),
  purgeCloudflareDetailUrls: mock(async () => ({ success: true })),
  purgeCloudflareCacheByTags: mock(async () => ({ success: true })),
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const {
  bulkToggleActiveCustomers,
  bulkDeleteCustomers,
  bulkSetStatusCustomers,
} = await import("@/admin/actions/customer/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// =============================================================================
// Fixtures
// =============================================================================

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

// =============================================================================
// bulkToggleActiveCustomers
// =============================================================================

describe("bulkToggleActiveCustomers", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkToggleActiveCustomersCommand.mockClear();
    mockUpdateTag.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkToggleActiveCustomers([], true);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkToggleActiveCustomers(
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

      const result = await bulkToggleActiveCustomers(ids, true);

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
      mockBulkToggleActiveCustomersCommand.mockResolvedValueOnce({
        count: 100,
        isActive: true,
        affectedIds: ids,
      });

      const result = await bulkToggleActiveCustomers(ids, true);

      expect(isMutationError(result)).toBe(false);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("正常系", () => {
    test("isActive: true で executeAdminMutationResult が resource: customer, action: update で呼ばれる", async () => {
      mockBulkToggleActiveCustomersCommand.mockResolvedValueOnce({
        count: 2,
        isActive: true,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      const result = await bulkToggleActiveCustomers(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "customer",
          action: "update",
        }),
      );
      expect(mockBulkToggleActiveCustomersCommand).toHaveBeenCalledWith(
        [VALID_UUID_A, VALID_UUID_B],
        true,
      );
      expect(result).toMatchObject({ count: 2, isActive: true });
    });

    test("isActive: false で domain command に false が渡る", async () => {
      mockBulkToggleActiveCustomersCommand.mockResolvedValueOnce({
        count: 1,
        isActive: false,
        affectedIds: [VALID_UUID_A],
      });

      await bulkToggleActiveCustomers([VALID_UUID_A], false);

      expect(mockBulkToggleActiveCustomersCommand).toHaveBeenCalledWith(
        [VALID_UUID_A],
        false,
      );
    });

    test("afterSuccess で updateTag が affectedIds 分 + ベースタグで呼ばれる", async () => {
      mockBulkToggleActiveCustomersCommand.mockResolvedValueOnce({
        count: 2,
        isActive: true,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      await bulkToggleActiveCustomers([VALID_UUID_A, VALID_UUID_B], true);

      // ベースタグ 1 + detail tags 2 = 3 calls
      expect(mockUpdateTag).toHaveBeenCalledTimes(3);
    });
  });
});

// =============================================================================
// bulkDeleteCustomers
// =============================================================================

describe("bulkDeleteCustomers", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkDeleteCustomersCommand.mockClear();
    mockUpdateTag.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error", async () => {
      const result = await bulkDeleteCustomers([]);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("100件超は validation error", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, "0");
        return `00000000-0000-4000-8000-${hex}`;
      });

      const result = await bulkDeleteCustomers(ids);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: customer, action: delete で呼ばれる", async () => {
      mockBulkDeleteCustomersCommand.mockResolvedValueOnce({
        count: 2,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      const result = await bulkDeleteCustomers([VALID_UUID_A, VALID_UUID_B]);

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "customer",
          action: "delete",
        }),
      );
      expect(mockBulkDeleteCustomersCommand).toHaveBeenCalledWith([
        VALID_UUID_A,
        VALID_UUID_B,
      ]);
      expect(result).toMatchObject({ count: 2 });
    });

    test("afterSuccess で updateTag が affectedIds 分 + ベースタグで呼ばれる", async () => {
      mockBulkDeleteCustomersCommand.mockResolvedValueOnce({
        count: 2,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
      });

      await bulkDeleteCustomers([VALID_UUID_A, VALID_UUID_B]);

      // ベースタグ 1 + detail tags 2 = 3 calls
      expect(mockUpdateTag).toHaveBeenCalledTimes(3);
    });
  });
});

// =============================================================================
// bulkSetStatusCustomers
// =============================================================================

describe("bulkSetStatusCustomers", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockBulkSetStatusCustomersCommand.mockClear();
    mockUpdateTag.mockClear();
  });

  describe("バリデーション", () => {
    test("空配列は validation error（min 1）", async () => {
      const result = await bulkSetStatusCustomers([], CustomerStatus.REGULAR);

      expect(isMutationError(result)).toBe(true);
      if (isMutationError(result)) {
        expect(result.error).toBe("入力内容に誤りがあります");
        expect(result.fieldErrors?.["ids"]).toBeDefined();
      }
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });

    test("非 UUID の ID は validation error", async () => {
      const result = await bulkSetStatusCustomers(
        ["not-a-uuid"],
        CustomerStatus.VIP,
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

      const result = await bulkSetStatusCustomers(ids, CustomerStatus.REGULAR);

      expect(isMutationError(result)).toBe(true);
      expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("executeAdminMutationResult が resource: customer, action: update で呼ばれる", async () => {
      mockBulkSetStatusCustomersCommand.mockResolvedValueOnce({
        count: 2,
        newStatus: CustomerStatus.VIP,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
        rejectedIds: [],
      });

      const result = await bulkSetStatusCustomers(
        [VALID_UUID_A, VALID_UUID_B],
        CustomerStatus.VIP,
      );

      expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
      expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "customer",
          action: "update",
        }),
      );
      expect(mockBulkSetStatusCustomersCommand).toHaveBeenCalledWith(
        [VALID_UUID_A, VALID_UUID_B],
        CustomerStatus.VIP,
      );
      expect(result).toMatchObject({ count: 2, newStatus: CustomerStatus.VIP });
    });

    test("afterSuccess で updateTag が affectedIds 分 + ベースタグで呼ばれる", async () => {
      mockBulkSetStatusCustomersCommand.mockResolvedValueOnce({
        count: 2,
        newStatus: CustomerStatus.INACTIVE,
        affectedIds: [VALID_UUID_A, VALID_UUID_B],
        rejectedIds: [],
      });

      await bulkSetStatusCustomers(
        [VALID_UUID_A, VALID_UUID_B],
        CustomerStatus.INACTIVE,
      );

      // ベースタグ 1 + detail tags 2 = 3 calls
      expect(mockUpdateTag).toHaveBeenCalledTimes(3);
    });

    test("rejectedIds がある場合でも正常に完了する", async () => {
      mockBulkSetStatusCustomersCommand.mockResolvedValueOnce({
        count: 1,
        newStatus: CustomerStatus.BLACKLIST,
        affectedIds: [VALID_UUID_A],
        rejectedIds: [VALID_UUID_B],
      });

      const result = await bulkSetStatusCustomers(
        [VALID_UUID_A, VALID_UUID_B],
        CustomerStatus.BLACKLIST,
      );

      expect(isMutationError(result)).toBe(false);
      expect(result).toMatchObject({ count: 1 });
    });
  });
});
