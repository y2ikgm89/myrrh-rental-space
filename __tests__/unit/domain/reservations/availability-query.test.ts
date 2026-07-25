import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockReservationFindMany = mock<
  (_args?: unknown) => Promise<Array<{ startTime: Date; endTime: Date }>>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findMany: (args: unknown) => mockReservationFindMany(args),
    },
  },
}));

const { getReservationsForDateQuery } =
  await import("@/shared/domain/reservations/availability");

const SPACE_ID = "space-1";
const DATE_START = new Date("2026-07-27T00:00:00+09:00");
const DATE_END = new Date("2026-07-27T23:59:59+09:00");

beforeEach(() => {
  mockReservationFindMany.mockReset();
  mockReservationFindMany.mockResolvedValue([]);
});

describe("getReservationsForDateQuery", () => {
  test("半開区間 overlap (startTime < dateEnd AND endTime > dateStart) で問い合わせる", async () => {
    await getReservationsForDateQuery(SPACE_ID, DATE_START, DATE_END);

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          spaceId: SPACE_ID,
          deletedAt: null,
          status: { in: ["PENDING", "CONFIRMED"] },
          AND: [
            { startTime: { lt: DATE_END } },
            { endTime: { gt: DATE_START } },
          ],
        }),
      }),
    );
  });

  test("旧 startTime gte/lte 窓ではなく overlap 条件を使う（前日開始・当日終了の予約を拾う）", async () => {
    // 前日 22:00 開始 → 当日 02:00 終了の予約は overlap 条件で取得される
    const crossMidnight = {
      startTime: new Date("2026-07-26T22:00:00+09:00"),
      endTime: new Date("2026-07-27T02:00:00+09:00"),
    };
    mockReservationFindMany.mockResolvedValue([crossMidnight]);

    const result = await getReservationsForDateQuery(
      SPACE_ID,
      DATE_START,
      DATE_END,
    );

    expect(result).toEqual([crossMidnight]);
    const call = mockReservationFindMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(call.where.AND).toEqual([
      { startTime: { lt: DATE_END } },
      { endTime: { gt: DATE_START } },
    ]);
  });
});
