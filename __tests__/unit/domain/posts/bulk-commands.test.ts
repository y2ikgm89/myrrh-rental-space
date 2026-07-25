import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<(_args?: unknown) => Promise<{ id: string }[]>>(() =>
  Promise.resolve([]),
);

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
      findMany: (args: unknown) => mockFindMany(args),
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
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 0 });
  });

  test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
    const result = await bulkTogglePublishedCommand([], true);

    expect(result).toEqual({
      count: 0,
      isPublished: true,
      affectedIds: [],
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("publish: true は DRAFT のみ PUBLISHED に更新する", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: POST_A }, { id: POST_B }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkTogglePublishedCommand([POST_A, POST_B], true);

    expect(result).toEqual({
      count: 2,
      isPublished: true,
      affectedIds: [POST_A, POST_B],
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [POST_A, POST_B] },
        status: "DRAFT",
      },
      select: { id: true },
    });
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
    mockFindMany.mockResolvedValueOnce([{ id: POST_A }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await bulkTogglePublishedCommand([POST_A], false);

    expect(result).toEqual({
      count: 1,
      isPublished: false,
      affectedIds: [POST_A],
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [POST_A] },
        status: "PUBLISHED",
      },
      select: { id: true },
    });
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

  test("対象が無い場合は count: 0 を返し updateMany を呼ばない", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await bulkTogglePublishedCommand([POST_A], false);

    expect(result).toEqual({
      count: 0,
      isPublished: false,
      affectedIds: [],
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED" }),
      }),
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("bulkDeletePostsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockDeleteMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
    const result = await bulkDeletePostsCommand([]);

    expect(result).toEqual({ count: 0, affectedIds: [] });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  test("指定 id を deleteMany し affectedIds を返す", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: POST_A }, { id: POST_B }]);
    mockDeleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkDeletePostsCommand([POST_A, POST_B]);

    expect(result).toEqual({ count: 2, affectedIds: [POST_A, POST_B] });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_A, POST_B] } },
      select: { id: true },
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_A, POST_B] } },
    });
  });

  test("対象が無い場合は count: 0 を返し deleteMany を呼ばない", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await bulkDeletePostsCommand([POST_A]);

    expect(result).toEqual({ count: 0, affectedIds: [] });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
