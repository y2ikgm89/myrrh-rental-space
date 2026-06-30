import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Role } from "@generated/prisma/enums";

const mockFindMany = mock(() => Promise.resolve([]));
const mockFindFirst = mock(() => Promise.resolve(null));
const mockCount = mock(() => Promise.resolve(0));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      count: mockCount,
    },
  },
}));

const { getUser, getUsers, getUserStats } =
  await import("@/shared/domain/users/queries");

const DASHBOARD_ROLE_LIST = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

describe("users/queries", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockFindFirst.mockClear();
    mockCount.mockClear();

    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);
    mockCount.mockResolvedValue(0);
  });

  test("getUsers はスタッフ管理ロールだけを一覧対象にする", async () => {
    await getUsers();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ role: { in: DASHBOARD_ROLE_LIST } }]),
        }),
      }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ role: { in: DASHBOARD_ROLE_LIST } }]),
        }),
      }),
    );
  });

  test("getUsers は USER/CUSTOMER フィルタを無視してスタッフロールに戻す", async () => {
    await getUsers({ role: Role.USER });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ role: { in: DASHBOARD_ROLE_LIST } }]),
        }),
      }),
    );
  });

  test("getUsers は指定された管理ロールだけに絞り込める", async () => {
    await getUsers({ role: Role.EDITOR });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ role: { in: [Role.EDITOR] } }]),
        }),
      }),
    );
  });

  test("getUser は USER/CUSTOMER を詳細対象にしない", async () => {
    await getUser("11111111-1111-4111-8111-111111111111");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "11111111-1111-4111-8111-111111111111",
          role: { in: DASHBOARD_ROLE_LIST },
        },
      }),
    );
  });

  test("getUserStats はスタッフロール別に集計する", async () => {
    mockCount
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const stats = await getUserStats();

    expect(stats).toEqual({
      total: 4,
      superAdmins: 1,
      admins: 1,
      editors: 1,
      viewers: 1,
      recentStaff: 2,
    });
    expect(mockCount).toHaveBeenNthCalledWith(1, {
      where: { role: { in: DASHBOARD_ROLE_LIST } },
    });
    expect(mockCount).toHaveBeenNthCalledWith(6, {
      where: {
        role: { in: DASHBOARD_ROLE_LIST },
        createdAt: { gte: expect.any(Date) },
      },
    });
  });
});
