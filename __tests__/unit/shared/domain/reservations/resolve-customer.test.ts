import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// 1. モック関数定義（TDZ 回避のため import より前）
// ---------------------------------------------------------------------------

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockFindFirst = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "new-customer-id" }));

const mockUpdate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "existing-customer-id" }));

// ---------------------------------------------------------------------------
// 2. mock.module() — import より前
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
    },
    $transaction: mock(),
  },
}));

// ---------------------------------------------------------------------------
// 3. テスト対象 import
// ---------------------------------------------------------------------------

import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";

// ---------------------------------------------------------------------------
// Tx モック（prisma.$transaction のコールバック引数と同じ形状）
// ---------------------------------------------------------------------------

const mockTx = {
  customer: {
    findUnique: mockFindUnique,
    findFirst: mockFindFirst,
    create: mockCreate,
    update: mockUpdate,
  },
};

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const BASE_CUSTOMER_DATA = {
  lastName: "田中",
  firstName: "太郎",
  email: "taro@example.com",
  phoneNumber: "090-1234-5678",
  companyName: "テスト株式会社",
};

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("resolveOrCreateCustomer", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();

    // デフォルト: 顧客が見つからない
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "new-customer-id" });
    mockUpdate.mockResolvedValue({ id: "existing-customer-id" });
  });

  // -----------------------------------------------------------------------
  // Pattern 1: 新規メール + ゲスト → create with userId = null
  // -----------------------------------------------------------------------
  test("新規メール + ゲスト → 新規作成（userId = null）", async () => {
    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA },
      mockTx as never,
    );

    expect(result).toBe("new-customer-id");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastName: "田中",
          firstName: "太郎",
          email: "taro@example.com",
          emailCanonical: "taro@example.com",
          phoneNumber: "090-1234-5678",
          companyName: "テスト株式会社",
          userId: null,
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Pattern 2: 新規メール + ログイン → create with userId = user.id
  // -----------------------------------------------------------------------
  test("新規メール + ログイン → 新規作成（userId = user.id）", async () => {
    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA, userId: "user-123" },
      mockTx as never,
    );

    expect(result).toBe("new-customer-id");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-123",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Pattern 3: 既存 canonical email + 未リンク(userId=null) + ゲスト → 既存ゲスト顧客を返す
  // -----------------------------------------------------------------------
  test("既存 canonical email + 未リンク + ゲスト → 既存ゲスト顧客を返す", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "existing-unlinked-id",
    });

    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA },
      mockTx as never,
    );

    expect(result).toBe("existing-unlinked-id");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailCanonical: "taro@example.com", userId: null },
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Pattern 4: 既存メール + 未リンク + ログイン → ゲスト顧客を会員化せずログインユーザー用に新規作成
  // -----------------------------------------------------------------------
  test("既存メール + 未リンク + ログイン → ゲスト顧客を会員化せずログインユーザー用に新規作成", async () => {
    mockFindUnique.mockImplementation((args: Record<string, unknown>) => {
      const where = args["where"] as Record<string, unknown> | undefined;
      if (where?.["userId"]) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA, userId: "user-456" },
      mockTx as never,
    );

    expect(result).toBe("new-customer-id");
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "taro@example.com",
          emailCanonical: "taro@example.com",
          userId: "user-456",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Pattern 5: 既存メール + リンク済み(userId!=null) + ゲスト → 既存会員には紐づけずゲスト顧客を新規作成
  // -----------------------------------------------------------------------
  test("既存メール + リンク済み + ゲスト → 既存会員には紐づけずゲスト顧客を新規作成", async () => {
    mockFindUnique.mockImplementation((args: Record<string, unknown>) => {
      const where = args["where"] as Record<string, unknown> | undefined;
      if (where?.["email"]) {
        return Promise.resolve({
          id: "linked-customer-id",
          userId: "existing-user-999",
        } as { id: string });
      }
      return Promise.resolve(null);
    });

    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA },
      mockTx as never,
    );

    expect(result).toBe("new-customer-id");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "taro@example.com",
          userId: null,
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Pattern 6: 既存メール + リンク済み + 同一ユーザー → Step 1 で解決、変更なし
  // -----------------------------------------------------------------------
  test("既存メール + リンク済み + 同一ユーザー → Step 1 で解決、変更なし", async () => {
    mockFindUnique.mockImplementation((args: Record<string, unknown>) => {
      const where = args["where"] as Record<string, unknown> | undefined;
      if (where?.["userId"] === "user-same") {
        // Step 1: userId で検索 → 見つかる
        return Promise.resolve({
          id: "linked-customer-id",
        } as { id: string });
      }
      return Promise.resolve(null);
    });

    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA, userId: "user-same" },
      mockTx as never,
    );

    expect(result).toBe("linked-customer-id");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Pattern 7: 既存メール + リンク済み + 異なるユーザー → メールでは紐づけずログインユーザー用に新規作成
  // -----------------------------------------------------------------------
  test("既存メール + リンク済み + 異なるユーザー → メールでは紐づけずログインユーザー用に新規作成", async () => {
    mockFindUnique.mockImplementation((args: Record<string, unknown>) => {
      const where = args["where"] as Record<string, unknown> | undefined;
      if (where?.["userId"] === "user-different") {
        // Step 1: userId で検索 → 見つからない（別の顧客にリンクされている）
        return Promise.resolve(null);
      }
      if (where?.["email"]) {
        // Step 2: email で検索 → リンク済み顧客（別ユーザー）
        return Promise.resolve({
          id: "linked-to-other-customer-id",
          userId: "user-other",
        } as { id: string });
      }
      return Promise.resolve(null);
    });

    const result = await resolveOrCreateCustomer(
      { ...BASE_CUSTOMER_DATA, userId: "user-different" },
      mockTx as never,
    );

    expect(result).toBe("new-customer-id");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "taro@example.com",
          userId: "user-different",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // tx 省略時は prisma を使用
  // -----------------------------------------------------------------------
  test("tx 省略時は prisma シングルトンを使用", async () => {
    const result = await resolveOrCreateCustomer({ ...BASE_CUSTOMER_DATA });

    expect(result).toBe("new-customer-id");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
