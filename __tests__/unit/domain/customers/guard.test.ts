import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

// prisma.customer.findUnique は
// (a) ensureCustomerNotBlacklisted が `select: { status }` (= StatusRow) と
// (b) assertCustomerActive が `select: { isActive, status }` (= ActiveStatusRow)
// の両方で呼ぶ。singleton 上に共通の広い戻り型 (両方の superset) を持つ 1 本の
// mock を配線し、各テストは適切な shape を mockResolvedValueOnce で返す。
type CustomerFindUniqueRow = {
  status: CustomerStatus;
  isActive?: boolean;
};
type StatusRow = { status: CustomerStatus };
type ActiveStatusRow = { isActive: boolean; status: CustomerStatus };

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<CustomerFindUniqueRow | null>
>(() => Promise.resolve(null));

const mockFindFirst = mock<
  (args: Record<string, unknown>) => Promise<StatusRow | null>
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

import {
  assertCustomerActive,
  ensureCustomerNotBlacklisted,
} from "@/shared/domain/customers/guard";

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

describe("assertCustomerActive (OAUTH-BETTER-AUTH-01)", () => {
  // 個別 tx として mockFindUnique の狭い型 (ActiveStatusRow 側) を再宣言し、
  // ActiveGuardTx interface に構造適合させる。
  const mockActiveFindUnique = mock<
    (args: Record<string, unknown>) => Promise<ActiveStatusRow | null>
  >(() => Promise.resolve(null));
  const activeTx = { customer: { findUnique: mockActiveFindUnique } };

  beforeEach(() => {
    mockActiveFindUnique.mockReset();
    mockActiveFindUnique.mockResolvedValue(null);
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue(null);
  });

  test("Customer 未存在 → NOT_FOUND で throw", async () => {
    await expect(
      assertCustomerActive("cust-missing", activeTx),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockActiveFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cust-missing" },
        select: { isActive: true, status: true },
      }),
    );
  });

  test("isActive=true かつ status=REGULAR → 素通り", async () => {
    mockActiveFindUnique.mockResolvedValueOnce({
      isActive: true,
      status: CustomerStatus.REGULAR,
    });

    await expect(
      assertCustomerActive("cust-1", activeTx),
    ).resolves.toBeUndefined();
  });

  test("isActive=false → FORBIDDEN で throw", async () => {
    mockActiveFindUnique.mockResolvedValueOnce({
      isActive: false,
      status: CustomerStatus.REGULAR,
    });

    await expect(
      assertCustomerActive("cust-1", activeTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("status=BLACKLIST → FORBIDDEN で throw", async () => {
    mockActiveFindUnique.mockResolvedValueOnce({
      isActive: true,
      status: CustomerStatus.BLACKLIST,
    });

    await expect(
      assertCustomerActive("cust-1", activeTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("isActive=false かつ status=BLACKLIST の複合ケースも FORBIDDEN", async () => {
    mockActiveFindUnique.mockResolvedValueOnce({
      isActive: false,
      status: CustomerStatus.BLACKLIST,
    });

    await expect(
      assertCustomerActive("cust-1", activeTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("tx 省略時は prisma シングルトンを使用", async () => {
    mockFindUnique.mockResolvedValueOnce({
      isActive: true,
      status: CustomerStatus.REGULAR,
    });

    await expect(assertCustomerActive("cust-1")).resolves.toBeUndefined();
  });
});
