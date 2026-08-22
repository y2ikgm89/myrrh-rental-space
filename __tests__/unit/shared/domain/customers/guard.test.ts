/**
 * `src/shared/domain/customers/guard.ts` の pure helper と `assertCustomerActive`
 * の判定契約に対する unit test（MYPAGE-AUTH-02 再発防止）。
 *
 * 契約:
 * - `isCustomerActiveForMypage` は Customer.isActive === true かつ
 *   Customer.status !== BLACKLIST のみ true を返す SSoT predicate。
 * - `assertCustomerActive` は同 predicate false 時に DomainError(FORBIDDEN) を
 *   throw する（mypage layout の SC ガードと Server Action ガードで判定を揃える）。
 */

import { describe, test, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// 1. mock（server-only を空 module に、prisma facade を空 stub に）
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: () => Promise.resolve(null),
      findFirst: () => Promise.resolve(null),
    },
  },
}));

// ---------------------------------------------------------------------------
// 2. テスト対象 import（mock.module 後）
// ---------------------------------------------------------------------------

import {
  isCustomerActiveForMypage,
  assertCustomerActive,
  type ActiveGuardTx,
} from "@/shared/domain/customers/guard";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

// ---------------------------------------------------------------------------
// isCustomerActiveForMypage — truth table
// ---------------------------------------------------------------------------

describe("isCustomerActiveForMypage", () => {
  test("isActive=true + status=REGULAR → true", () => {
    expect(
      isCustomerActiveForMypage({
        isActive: true,
        status: CustomerStatus.REGULAR,
      }),
    ).toBe(true);
  });

  test("isActive=false + status=REGULAR → false（管理側停止）", () => {
    expect(
      isCustomerActiveForMypage({
        isActive: false,
        status: CustomerStatus.REGULAR,
      }),
    ).toBe(false);
  });

  test("isActive=true + status=BLACKLIST → false（bulkSetStatusCustomersCommand が生成する状態、MYPAGE-AUTH-02 の bypass ケース）", () => {
    expect(
      isCustomerActiveForMypage({
        isActive: true,
        status: CustomerStatus.BLACKLIST,
      }),
    ).toBe(false);
  });

  test("isActive=false + status=BLACKLIST → false", () => {
    expect(
      isCustomerActiveForMypage({
        isActive: false,
        status: CustomerStatus.BLACKLIST,
      }),
    ).toBe(false);
  });

  test("status=INACTIVE (退会) は isActive の状態に従う", () => {
    expect(
      isCustomerActiveForMypage({
        isActive: true,
        status: CustomerStatus.INACTIVE,
      }),
    ).toBe(true);
    expect(
      isCustomerActiveForMypage({
        isActive: false,
        status: CustomerStatus.INACTIVE,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertCustomerActive — DomainError(FORBIDDEN) が同 predicate に従うこと
// ---------------------------------------------------------------------------

function makeTx(
  result: { isActive: boolean; status: CustomerStatus } | null,
): ActiveGuardTx {
  return {
    customer: {
      findUnique: () => Promise.resolve(result),
    },
  };
}

describe("assertCustomerActive", () => {
  test("isActive=true + status=REGULAR → 通過（throw しない）", async () => {
    await expect(
      assertCustomerActive(
        "customer-1",
        makeTx({ isActive: true, status: CustomerStatus.REGULAR }),
      ),
    ).resolves.toBeUndefined();
  });

  test("isActive=false → DomainError(FORBIDDEN)", async () => {
    await expect(
      assertCustomerActive(
        "customer-2",
        makeTx({ isActive: false, status: CustomerStatus.REGULAR }),
      ),
    ).rejects.toMatchObject({ name: "DomainError", code: "FORBIDDEN" });
  });

  test("status=BLACKLIST + isActive=true → DomainError(FORBIDDEN)（MYPAGE-AUTH-02 の直接契約）", async () => {
    await expect(
      assertCustomerActive(
        "customer-3",
        makeTx({ isActive: true, status: CustomerStatus.BLACKLIST }),
      ),
    ).rejects.toMatchObject({ name: "DomainError", code: "FORBIDDEN" });
  });

  test("Customer が存在しない → DomainError(NOT_FOUND)", async () => {
    await expect(
      assertCustomerActive("customer-missing", makeTx(null)),
    ).rejects.toMatchObject({ name: "DomainError", code: "NOT_FOUND" });
  });
});
