import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ status: CustomerStatus } | null>
>(() => Promise.resolve(null));

const mockFindFirst = mock<
  (args: Record<string, unknown>) => Promise<{ status: CustomerStatus } | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
  },
}));

import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";

const mockTx = {
  customer: { findUnique: mockFindUnique, findFirst: mockFindFirst },
};

describe("ensureCustomerNotBlacklisted", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
  });

  test("customerId指定 + BLACKLIST → FORBIDDENでthrow", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: CustomerStatus.BLACKLIST });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }, mockTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cust-1" },
      }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("customerId指定 + 非BLACKLIST → 素通り", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: CustomerStatus.REGULAR });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }, mockTx),
    ).resolves.toBeUndefined();
  });

  test("email指定(customerIdなし) + 既存ゲストBLACKLIST → FORBIDDENでthrow", async () => {
    mockFindFirst.mockResolvedValueOnce({ status: CustomerStatus.BLACKLIST });

    await expect(
      ensureCustomerNotBlacklisted({ email: "Taro@Example.com" }, mockTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailCanonical: "taro@example.com", userId: null },
      }),
    );
  });

  test("email指定 + 該当customerなし → 素通り", async () => {
    await expect(
      ensureCustomerNotBlacklisted({ email: "new@example.com" }, mockTx),
    ).resolves.toBeUndefined();
  });

  test("customerId・emailどちらも未指定 → no-op（検索しない）", async () => {
    await expect(
      ensureCustomerNotBlacklisted({}, mockTx),
    ).resolves.toBeUndefined();

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("customerIdがnull + emailあり → emailで検索する", async () => {
    mockFindFirst.mockResolvedValueOnce({ status: CustomerStatus.BLACKLIST });

    await expect(
      ensureCustomerNotBlacklisted(
        { customerId: null, email: "guest@example.com" },
        mockTx,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("tx省略時は prisma シングルトンを使用", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: CustomerStatus.REGULAR });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }),
    ).resolves.toBeUndefined();
  });
});
