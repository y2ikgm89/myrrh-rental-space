import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockDeleteMany = mock<(_args?: unknown) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    news: {
      deleteMany: (args: unknown) => mockDeleteMany(args),
    },
  },
}));

const { permanentlyDeleteExpiredNewsTrash } =
  await import("@/shared/domain/news/trash-commands");

describe("permanentlyDeleteExpiredNewsTrash", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  test("保持期間超過の soft-delete 行を deleteMany する", async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 3 });
    const before = Date.now();

    const result = await permanentlyDeleteExpiredNewsTrash(30);

    const after = Date.now();
    expect(result).toEqual({ deleted: 3 });
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    const call = mockDeleteMany.mock.calls[0];
    if (!call) throw new Error("deleteMany was not called");
    const args = call[0] as {
      where: { deletedAt: { not: null; lt: Date } };
    };
    expect(args.where.deletedAt.not).toBeNull();
    const threshold = args.where.deletedAt.lt.getTime();
    const expectedLow = before - 30 * 24 * 60 * 60 * 1000;
    const expectedHigh = after - 30 * 24 * 60 * 60 * 1000;
    expect(threshold).toBeGreaterThanOrEqual(expectedLow);
    expect(threshold).toBeLessThanOrEqual(expectedHigh);
  });

  test("retentionDays < 0 は VALIDATION", async () => {
    await expect(permanentlyDeleteExpiredNewsTrash(-1)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
