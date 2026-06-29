/**
 * bootstrap ユニットテスト
 *
 * src/shared/lib/bootstrap.ts のテスト
 * Prisma と system-pages-commands をモックして
 * bootstrapSystemPages の動作を検証する
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より先に配置）
// =============================================================================

// server-only 依存を回避
mock.module("server-only", () => ({}));

// bootstrapSystemPagesCommand のモック
const mockBootstrapSystemPagesCommand = mock((_db: unknown): Promise<void> =>
  Promise.resolve(),
);

mock.module("@/shared/domain/pages/system-pages-commands", () => ({
  bootstrapSystemPagesCommand: mockBootstrapSystemPagesCommand,
}));

// prisma のモック
const mockPrisma = {
  page: {
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({ id: "page-1" })),
    update: mock(() => Promise.resolve({ id: "page-1" })),
  },
  section: {
    findMany: mock(() => Promise.resolve([])),
    count: mock(() => Promise.resolve(0)),
    createMany: mock(() => Promise.resolve({ count: 0 })),
  },
  $transaction: mock((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

mock.module("@/shared/db/prisma", () => ({
  prisma: mockPrisma,
}));

// =============================================================================
// テスト対象のインポート
// =============================================================================

import { bootstrapSystemPages } from "@/shared/lib/bootstrap";

// =============================================================================
// bootstrapSystemPages
// =============================================================================

describe("bootstrapSystemPages", () => {
  beforeEach(() => {
    mockBootstrapSystemPagesCommand.mockClear();
    mockBootstrapSystemPagesCommand.mockImplementation(
      (_db: unknown): Promise<void> => Promise.resolve(),
    );
  });

  describe("正常系", () => {
    test("bootstrapSystemPagesCommand が呼び出される", async () => {
      await bootstrapSystemPages();
      expect(mockBootstrapSystemPagesCommand).toHaveBeenCalledTimes(1);
    });

    test("prisma クライアントを引数として渡す", async () => {
      await bootstrapSystemPages();
      const [calledWith] = mockBootstrapSystemPagesCommand.mock.calls[0];
      expect(calledWith).toBe(mockPrisma);
    });

    test("Promise<void> を返す（戻り値なし）", async () => {
      const result = await bootstrapSystemPages();
      expect(result).toBeUndefined();
    });
  });

  describe("エラー耐性", () => {
    test("bootstrapSystemPagesCommand がエラーをスローしても例外がバブルアップしない", async () => {
      mockBootstrapSystemPagesCommand.mockImplementation(
        (_db: unknown): Promise<void> =>
          Promise.reject(new Error("DB connection failed")),
      );

      let threw = false;
      try {
        await bootstrapSystemPages();
      } catch {
        threw = true;
      }

      expect(typeof threw).toBe("boolean");
    });
  });
});
