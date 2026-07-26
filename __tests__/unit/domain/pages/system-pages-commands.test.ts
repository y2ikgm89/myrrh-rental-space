/**
 * system-pages-commands ユニットテスト
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockPageFindUnique = mock<
  (args: unknown) => Promise<{ id: string; isSystemPage: boolean } | null>
>(() => Promise.resolve(null));
const mockPageCreate = mock<
  (args: unknown) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "page-new", slug: "about" }));
const mockPageUpdate = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockSectionFindMany = mock<
  (args: unknown) => Promise<Array<{ type: string }>>
>(() => Promise.resolve([]));
const mockSectionCreateMany = mock<
  (args: unknown) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockTransaction = mock((fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    section: {
      findMany: mockSectionFindMany,
      createMany: mockSectionCreateMany,
    },
  }),
);

const mockPrisma = {
  page: {
    findUnique: mockPageFindUnique,
    create: mockPageCreate,
    update: mockPageUpdate,
  },
  section: {
    findMany: mockSectionFindMany,
    createMany: mockSectionCreateMany,
  },
  $transaction: mockTransaction,
};

mock.module("@/shared/db/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  bootstrapSystemPages,
  bootstrapSystemPagesCommand,
} from "@/shared/domain/pages/system-pages-commands";

describe("bootstrapSystemPagesCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageCreate.mockReset();
    mockPageUpdate.mockReset();
    mockSectionFindMany.mockReset();
    mockSectionCreateMany.mockReset();
    mockTransaction.mockClear();

    mockPageFindUnique.mockResolvedValue(null);
    mockPageCreate.mockResolvedValue({ id: "page-new", slug: "about" });
    mockSectionFindMany.mockResolvedValue([]);
    mockSectionCreateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation((fn) =>
      fn({
        section: {
          findMany: mockSectionFindMany,
          createMany: mockSectionCreateMany,
        },
      }),
    );
  });

  test("既存ページがない場合は page を作成する", async () => {
    await bootstrapSystemPagesCommand(mockPrisma as never);
    expect(mockPageCreate).toHaveBeenCalled();
  });

  test("per-page エラーでも throw しない", async () => {
    mockPageFindUnique.mockRejectedValue(new Error("DB connection failed"));
    await expect(
      bootstrapSystemPagesCommand(mockPrisma as never),
    ).resolves.toBeUndefined();
  });
});

describe("bootstrapSystemPages", () => {
  test("Promise<void> を返す", async () => {
    await expect(bootstrapSystemPages()).resolves.toBeUndefined();
  });
});
