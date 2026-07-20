import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([]),
);

const mockUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

// bulk-commands は anonymizeCustomerCommand を呼び出す実装のため、
// commands.ts の該当 command を mock 化して bulk 側のロジック
// (ループ / skip 判定 / 集計) だけを検証する。
const mockAnonymizeCustomerCommand = mock<
  (input: { customerId: string; reason: string }) => Promise<{
    customerId: string;
    anonymizedAt: Date;
    reason: string;
    hadUserId: boolean;
    preservedSuppression: boolean;
  }>
>(({ customerId, reason }) =>
  Promise.resolve({
    customerId,
    anonymizedAt: new Date(),
    reason,
    hadUserId: false,
    preservedSuppression: false,
  }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findMany: () => mockFindMany(),
      updateMany: () => mockUpdateMany(),
    },
  },
}));

class MockDomainError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
}

mock.module("@/shared/domain/customers/commands", () => ({
  anonymizeCustomerCommand: mockAnonymizeCustomerCommand,
}));

mock.module("@/shared/domain/domain-error", () => ({
  DomainError: MockDomainError,
  isDomainError: (error: unknown): error is MockDomainError =>
    error instanceof MockDomainError,
}));

const { bulkToggleActiveCustomersCommand, bulkAnonymizeCustomersCommand } =
  await import("@/shared/domain/customers/bulk-commands");

const CUSTOMER_A = { id: "11111111-1111-4111-8111-111111111111" };
const CUSTOMER_B = { id: "22222222-2222-4222-8222-222222222222" };

describe("bulkToggleActiveCustomersCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkToggleActiveCustomersCommand([], true);

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件 isActive: true で有効化成功", async () => {
      mockFindMany.mockResolvedValueOnce([CUSTOMER_A, CUSTOMER_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id, CUSTOMER_B.id],
        true,
      );

      expect(result).toEqual({
        count: 2,
        isActive: true,
        affectedIds: [CUSTOMER_A.id, CUSTOMER_B.id],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("isActive: false で無効化成功", async () => {
      mockFindMany.mockResolvedValueOnce([CUSTOMER_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id],
        false,
      );

      expect(result.isActive).toBe(false);
      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([CUSTOMER_A.id]);
    });

    test("対象が見つからない場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id],
        true,
      );

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
      });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// bulkAnonymizeCustomersCommand (STATE-03)
// =============================================================================

describe("bulkAnonymizeCustomersCommand", () => {
  beforeEach(() => {
    mockAnonymizeCustomerCommand.mockReset();
    mockAnonymizeCustomerCommand.mockImplementation(({ customerId, reason }) =>
      Promise.resolve({
        customerId,
        anonymizedAt: new Date(),
        reason,
        hadUserId: false,
        preservedSuppression: false,
      }),
    );
  });

  describe("正常系", () => {
    test("ids が空配列なら anonymize を呼ばずゼロ返却", async () => {
      const result = await bulkAnonymizeCustomersCommand(
        [],
        "customer-requested",
      );

      expect(result).toEqual({
        count: 0,
        affectedIds: [],
        affected: [],
        skippedIds: [],
      });
      expect(mockAnonymizeCustomerCommand).not.toHaveBeenCalled();
    });

    test("複数件を逐次 anonymize し affectedIds を返す", async () => {
      const result = await bulkAnonymizeCustomersCommand(
        [CUSTOMER_A.id, CUSTOMER_B.id],
        "admin-purge",
      );

      expect(result.count).toBe(2);
      expect(result.affectedIds).toEqual([CUSTOMER_A.id, CUSTOMER_B.id]);
      expect(result.affected.map((a) => a.id)).toEqual([
        CUSTOMER_A.id,
        CUSTOMER_B.id,
      ]);
      expect(result.skippedIds).toEqual([]);
      expect(mockAnonymizeCustomerCommand).toHaveBeenCalledTimes(2);
      expect(mockAnonymizeCustomerCommand).toHaveBeenNthCalledWith(1, {
        customerId: CUSTOMER_A.id,
        reason: "admin-purge",
      });
      expect(mockAnonymizeCustomerCommand).toHaveBeenNthCalledWith(2, {
        customerId: CUSTOMER_B.id,
        reason: "admin-purge",
      });
    });

    test("既に匿名化済み (CONFLICT) の ID は skippedIds に含めて成功扱い", async () => {
      mockAnonymizeCustomerCommand.mockImplementationOnce(() =>
        Promise.reject(
          new MockDomainError("この顧客は既に匿名化済みです", "CONFLICT"),
        ),
      );
      mockAnonymizeCustomerCommand.mockImplementationOnce(
        ({ customerId, reason }) =>
          Promise.resolve({
            customerId,
            anonymizedAt: new Date(),
            reason,
            hadUserId: false,
            preservedSuppression: false,
          }),
      );

      const result = await bulkAnonymizeCustomersCommand(
        [CUSTOMER_A.id, CUSTOMER_B.id],
        "customer-requested",
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([CUSTOMER_B.id]);
      expect(result.skippedIds).toEqual([CUSTOMER_A.id]);
    });
  });

  describe("異常系", () => {
    test("NOT_FOUND は skip せず throw して伝播する", async () => {
      mockAnonymizeCustomerCommand.mockImplementationOnce(() =>
        Promise.reject(
          new MockDomainError("顧客が見つかりません", "NOT_FOUND"),
        ),
      );

      await expect(
        bulkAnonymizeCustomersCommand(
          [CUSTOMER_A.id, CUSTOMER_B.id],
          "customer-requested",
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("DomainError 以外の error も throw して伝播する", async () => {
      mockAnonymizeCustomerCommand.mockImplementationOnce(() =>
        Promise.reject(new Error("DB disconnected")),
      );

      await expect(
        bulkAnonymizeCustomersCommand([CUSTOMER_A.id], "customer-requested"),
      ).rejects.toThrow("DB disconnected");
    });
  });
});
