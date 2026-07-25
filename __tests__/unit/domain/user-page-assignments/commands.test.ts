import { describe, test, expect, mock, beforeEach } from "bun:test";

const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  USER: "USER",
  CUSTOMER: "CUSTOMER",
} as const;

const mockUserFindUnique = mock<
  (args: unknown) => Promise<{ id: string; role: string } | null>
>(() => Promise.resolve(null));

const mockPageFindMany = mock<(args: unknown) => Promise<{ id: string }[]>>(
  () => Promise.resolve([]),
);

const mockAssignmentDeleteMany = mock<
  (args: unknown) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockAssignmentCreateMany = mock<
  (args: unknown) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockTransaction = mock(
  async (
    callback: (tx: {
      userPageAssignment: {
        deleteMany: typeof mockAssignmentDeleteMany;
        createMany: typeof mockAssignmentCreateMany;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      userPageAssignment: {
        deleteMany: mockAssignmentDeleteMany,
        createMany: mockAssignmentCreateMany,
      },
    }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    page: { findMany: mockPageFindMany },
    $transaction: mockTransaction,
  },
}));

const { setAssignedPageIdsForUser } =
  await import("@/shared/domain/user-page-assignments/commands");

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const PAGE_ID_1 = "660e8400-e29b-41d4-a716-446655440001";
const PAGE_ID_2 = "660e8400-e29b-41d4-a716-446655440002";

describe("setAssignedPageIdsForUser", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset().mockResolvedValue({
      id: USER_ID,
      role: Role.EDITOR,
    });
    mockPageFindMany.mockReset().mockResolvedValue([]);
    mockAssignmentDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    mockAssignmentCreateMany.mockReset().mockResolvedValue({ count: 0 });
    mockTransaction.mockClear();
  });

  test("EDITOR の割り当てを全置換する (deleteMany → createMany)", async () => {
    mockPageFindMany.mockResolvedValueOnce([
      { id: PAGE_ID_1 },
      { id: PAGE_ID_2 },
    ]);

    const result = await setAssignedPageIdsForUser(USER_ID, [
      PAGE_ID_1,
      PAGE_ID_2,
    ]);

    expect(result).toEqual({
      userId: USER_ID,
      pageIds: [PAGE_ID_1, PAGE_ID_2],
    });
    expect(mockAssignmentDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(mockAssignmentCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { userId: USER_ID, pageId: PAGE_ID_1 },
          { userId: USER_ID, pageId: PAGE_ID_2 },
        ],
      }),
    );
  });

  test("空配列を渡すと全解除し createMany は呼ばない", async () => {
    const result = await setAssignedPageIdsForUser(USER_ID, []);

    expect(result.pageIds).toEqual([]);
    expect(mockAssignmentDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(mockAssignmentCreateMany).not.toHaveBeenCalled();
  });

  test("重複 pageId は dedupe される", async () => {
    mockPageFindMany.mockResolvedValueOnce([{ id: PAGE_ID_1 }]);

    const result = await setAssignedPageIdsForUser(USER_ID, [
      PAGE_ID_1,
      PAGE_ID_1,
    ]);

    expect(result.pageIds).toEqual([PAGE_ID_1]);
    expect(mockAssignmentCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ userId: USER_ID, pageId: PAGE_ID_1 }],
      }),
    );
  });

  test("EDITOR 以外のユーザーは VALIDATION で transaction を呼ばない", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      role: Role.ADMIN,
    });

    await expect(
      setAssignedPageIdsForUser(USER_ID, [PAGE_ID_1]),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("存在しないページ ID が含まれる場合は NOT_FOUND", async () => {
    mockPageFindMany.mockResolvedValueOnce([{ id: PAGE_ID_1 }]);

    await expect(
      setAssignedPageIdsForUser(USER_ID, [PAGE_ID_1, PAGE_ID_2]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("存在しないユーザーは NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);

    await expect(
      setAssignedPageIdsForUser(USER_ID, [PAGE_ID_1]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
