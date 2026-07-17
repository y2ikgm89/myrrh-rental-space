import { describe, expect, mock, test } from "bun:test";

const mockUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 3 }),
);
const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([{ id: "r1" }, { id: "r2" }, { id: "r3" }]),
);
const txStub = {
  reservation: { updateMany: mockUpdateMany, findMany: mockFindMany },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: (fn: any) => fn(txStub) },
}));

const { applyBulkCancellation } =
  await import("@/shared/domain/reservations/cancel-core");

describe("applyBulkCancellation", () => {
  test("3 予約を一括 cancel、cancelledIds に 3 個返る", async () => {
    mockUpdateMany.mockClear();
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 3 }));
    mockFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "r1" }, { id: "r2" }, { id: "r3" }]),
    );

    const result = await applyBulkCancellation(
      txStub as any,
      ["r1", "r2", "r3"],
      {
        cancellationReason: "series bulk cancel",
        cancelledByType: "ADMIN",
        now: new Date("2026-08-01T00:00:00Z"),
      },
    );

    expect(result.cancelledIds).toEqual(["r1", "r2", "r3"]);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["r1", "r2", "r3"] },
          status: { in: ["PENDING", "CONFIRMED"] },
        }),
        data: expect.objectContaining({
          status: "CANCELLED",
          icsSequence: { increment: 1 },
        }),
      }),
    );
  });

  test("既に CANCELLED の予約は skip (count=0 の場合 empty)", async () => {
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    mockFindMany.mockImplementation(() => Promise.resolve([]));
    const result = await applyBulkCancellation(txStub as any, ["r1"], {
      cancellationReason: "test",
      cancelledByType: "ADMIN",
      now: new Date(),
    });
    expect(result.cancelledIds).toEqual([]);
  });
});
