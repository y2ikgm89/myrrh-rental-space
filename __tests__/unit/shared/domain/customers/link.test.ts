import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// 1. モック関数定義（TDZ 回避のため import より前）
// ---------------------------------------------------------------------------

type CustomerRecord = {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  userId: string | null;
  isActive: boolean;
};

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<CustomerRecord | null>
>(() => Promise.resolve(null));

const mockUpdate = mock<
  (args: Record<string, unknown>) => Promise<CustomerRecord>
>(() =>
  Promise.resolve({
    id: "updated-id",
    email: "test@example.com",
    lastName: "テスト",
    firstName: "",
    userId: "user-1",
    isActive: true,
  }),
);

const mockCreate = mock<
  (args: Record<string, unknown>) => Promise<CustomerRecord>
>(() =>
  Promise.resolve({
    id: "new-id",
    email: "test@example.com",
    lastName: "テスト",
    firstName: "",
    userId: "user-1",
    isActive: true,
  }),
);

const mockSendWelcomeEmail = mock<() => Promise<void>>(() => Promise.resolve());

const mockFireAndForget = mock<
  (promise: Promise<unknown>, opts: Record<string, unknown>) => void
>(() => {});

// ---------------------------------------------------------------------------
// 2. mock.module() — import より前
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      create: mockCreate,
    },
  },
}));

mock.module("@/shared/lib/email/welcome-emails", () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
}));

mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

// ---------------------------------------------------------------------------
// 3. テスト対象 import（mock.module 後）
// ---------------------------------------------------------------------------

import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { Prisma } from "@generated/prisma/client";

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const USER = {
  id: "user-1",
  email: "test@example.com",
  name: "テスト太郎",
};

const LINKED_CUSTOMER: CustomerRecord = {
  id: "customer-linked",
  email: "test@example.com",
  lastName: "テスト",
  firstName: "太郎",
  userId: "user-1",
  isActive: true,
};

const UNLINKED_CUSTOMER: CustomerRecord = {
  id: "customer-unlinked",
  email: "test@example.com",
  lastName: "テスト",
  firstName: "太郎",
  userId: null,
  isActive: true,
};

const OTHER_USER_CUSTOMER: CustomerRecord = {
  id: "customer-other",
  email: "test@example.com",
  lastName: "テスト",
  firstName: "太郎",
  userId: "user-other",
  isActive: true,
};

const NEW_CUSTOMER: CustomerRecord = {
  id: "customer-new",
  email: "test@example.com",
  lastName: "テスト太郎",
  firstName: "",
  userId: "user-1",
  isActive: true,
};

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("ensureCustomerLinked", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockSendWelcomeEmail.mockReset();
    mockFireAndForget.mockReset();

    // デフォルト: 顧客が見つからない
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(NEW_CUSTOMER);
  });

  // -----------------------------------------------------------------------
  // Pattern 1: userId で既存リンクあり → そのまま返す
  // -----------------------------------------------------------------------
  test("userId で既存リンクあり → そのまま返す", async () => {
    // Step 1: userId で検索 → 見つかる
    mockFindUnique.mockResolvedValueOnce(LINKED_CUSTOMER);

    const result = await ensureCustomerLinked(USER);

    expect(result).toEqual({ customer: LINKED_CUSTOMER, isNew: false });
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Pattern 2: email 一致 + userId = null → 既存ゲストを自動会員化せず新規会員顧客を作成
  // -----------------------------------------------------------------------
  test("email 一致 + userId = null → 既存ゲストを自動会員化せず新規会員顧客を作成", async () => {
    // Step 1: userId で検索 → 見つからない
    // 旧実装の Step 2: email で検索 → 未リンク顧客
    mockFindUnique
      .mockResolvedValueOnce(null) // Step 1
      .mockResolvedValueOnce(UNLINKED_CUSTOMER); // Step 2

    const result = await ensureCustomerLinked(USER);

    expect(result).toEqual({ customer: NEW_CUSTOMER, isNew: true });
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          emailCanonical: "test@example.com",
          userId: "user-1",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Pattern 3: email 一致 + userId = 別ユーザー → 新規作成（乗っ取り防止）
  // -----------------------------------------------------------------------
  test("email 一致 + userId = 別ユーザー → 新規作成（乗っ取り防止）", async () => {
    // Step 1: userId で検索 → 見つからない
    // 旧実装の Step 2: email で検索 → 別ユーザーにリンク済み
    mockFindUnique
      .mockResolvedValueOnce(null) // Step 1
      .mockResolvedValueOnce(OTHER_USER_CUSTOMER); // Step 2

    const result = await ensureCustomerLinked(USER);

    expect(result).toEqual({ customer: NEW_CUSTOMER, isNew: true });
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    // update は呼ばれない（乗っ取り防止）
    expect(mockUpdate).not.toHaveBeenCalled();
    // 新規作成される
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          emailCanonical: "test@example.com",
          lastName: "テスト太郎",
          firstName: "",
          userId: "user-1",
        }),
      }),
    );
    // ウェルカムメールが送信される
    expect(mockFireAndForget).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Pattern 4: email 一致なし → 新規作成
  // -----------------------------------------------------------------------
  test("email 一致なし → 新規作成", async () => {
    // Step 1: userId で検索 → 見つからない
    // 旧実装の Step 2: email で検索 → 見つからない
    mockFindUnique
      .mockResolvedValueOnce(null) // Step 1
      .mockResolvedValueOnce(null); // Step 2

    const result = await ensureCustomerLinked(USER);

    expect(result).toEqual({ customer: NEW_CUSTOMER, isNew: true });
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          emailCanonical: "test@example.com",
          lastName: "テスト太郎",
          firstName: "",
          userId: "user-1",
        }),
      }),
    );
    expect(mockFireAndForget).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Pattern 5: P2002 競合 → フォールバッククエリ
  // -----------------------------------------------------------------------
  test("P2002 競合 → フォールバッククエリで既存顧客を返す", async () => {
    // Step 1: userId で検索 → 見つからない
    // Step 3: create → P2002（unique constraint violation）
    // Fallback: userId で再検索 → 見つかる
    mockFindUnique
      .mockResolvedValueOnce(null) // Step 1
      .mockResolvedValueOnce(LINKED_CUSTOMER); // Fallback

    mockCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.0.0",
      }),
    );

    const result = await ensureCustomerLinked(USER);

    expect(result).toEqual({ customer: LINKED_CUSTOMER, isNew: false });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // フォールバックの findUnique（2回目）
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });
});
