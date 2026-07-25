import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockUpdateMany = mock<(_args?: unknown) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

const mockDeleteMany = mock<(_args?: unknown) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));

mock.module("@generated/prisma/enums", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED",
  },
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: {
      updateMany: (args: unknown) => mockUpdateMany(args),
      deleteMany: (args: unknown) => mockDeleteMany(args),
    },
  },
}));

const { bulkTogglePublishedCommand, bulkDeletePostsCommand } =
  await import("@/shared/domain/posts/bulk-commands");

const POST_A = "11111111-1111-4111-8111-111111111111";
const POST_B = "22222222-2222-4222-8222-222222222222";

describe("bulkTogglePublishedCommand", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
    const result = await bulkTogglePublishedCommand([], true);

    expect(result).toEqual({ count: 0, isPublished: true });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("publish: true は DRAFT のみ PUBLISHED に更新する", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkTogglePublishedCommand([POST_A, POST_B], true);

    expect(result).toEqual({ count: 2, isPublished: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [POST_A, POST_B] },
        status: "DRAFT",
      },
      data: {
        status: "PUBLISHED",
        publishedAt: expect.any(Date),
      },
    });
  });

  test("publish: false は PUBLISHED のみ DRAFT に更新する", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await bulkTogglePublishedCommand([POST_A], false);

    expect(result).toEqual({ count: 1, isPublished: false });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [POST_A] },
        status: "PUBLISHED",
      },
      data: {
        status: "DRAFT",
        publishedAt: null,
      },
    });
  });

  test("対象が無い場合は count: 0 を返す（ARCHIVED 等は where で除外）", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await bulkTogglePublishedCommand([POST_A], false);

    expect(result).toEqual({ count: 0, isPublished: false });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED" }),
      }),
    );
  });
});

describe("bulkDeletePostsCommand", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  test("指定 id を deleteMany する", async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkDeletePostsCommand([POST_A, POST_B]);

    expect(result).toEqual({ count: 2 });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_A, POST_B] } },
    });
  });
});
