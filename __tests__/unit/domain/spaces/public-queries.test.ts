import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const spaceFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const spaceCount = mock<(_args?: unknown) => Promise<number>>(() =>
  Promise.resolve(0),
);
const reservationFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const eventTimeSlotFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(
  () => Promise.resolve([]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: (args: unknown) => spaceFindMany(args),
      count: (args: unknown) => spaceCount(args),
    },
    reservation: {
      findMany: (args: unknown) => reservationFindMany(args),
    },
    eventTimeSlot: {
      findMany: (args: unknown) => eventTimeSlotFindMany(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
mock.module("@/shared/lib/errors/server", () => ({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
}));

const {
  getPublishedSpacesPaginated,
  getPublishedSpacesPaginatedWithAvailability,
  getPublicSpaceFacilityNames,
} = await import("@/shared/domain/spaces/public-queries");

function resetAllMocks() {
  spaceFindMany.mockReset();
  spaceCount.mockReset();
  reservationFindMany.mockReset();
  eventTimeSlotFindMany.mockReset();
  spaceFindMany.mockResolvedValue([]);
  spaceCount.mockResolvedValue(0);
  reservationFindMany.mockResolvedValue([]);
  eventTimeSlotFindMany.mockResolvedValue([]);
}

function lastFindManyArg(): {
  where: Record<string, unknown>;
  orderBy: Record<string, string>;
  skip: number;
  take: number;
} {
  const call = spaceFindMany.mock.calls[0]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error("space.findMany was not called");
  }
  return call as {
    where: Record<string, unknown>;
    orderBy: Record<string, string>;
    skip: number;
    take: number;
  };
}

describe("getPublishedSpacesPaginated where clause", () => {
  beforeEach(resetAllMocks);

  test("引数なしは isPublished + isActive のみ", async () => {
    await getPublishedSpacesPaginated({});
    const { where, orderBy } = lastFindManyArg();
    expect(where).toEqual({ isPublished: true, isActive: true });
    expect(orderBy).toEqual({ name: "asc" });
  });

  test("categoryId + locationId が where に足される", async () => {
    await getPublishedSpacesPaginated({ categoryId: "c1", locationId: "l1" });
    const { where } = lastFindManyArg();
    expect(where).toMatchObject({
      isPublished: true,
      isActive: true,
      categoryId: "c1",
      locationId: "l1",
    });
  });

  test("q は 5 fields の OR（case-insensitive）", async () => {
    await getPublishedSpacesPaginated({ q: "Wi-Fi" });
    const { where } = lastFindManyArg();
    expect(where["OR"]).toEqual(
      expect.arrayContaining([
        { name: { contains: "Wi-Fi", mode: "insensitive" } },
        { descriptionPlainText: { contains: "Wi-Fi", mode: "insensitive" } },
        { addressDetail: { contains: "Wi-Fi", mode: "insensitive" } },
        { location: { name: { contains: "Wi-Fi", mode: "insensitive" } } },
        { location: { address: { contains: "Wi-Fi", mode: "insensitive" } } },
      ]),
    );
    expect(where["OR"]).toHaveLength(5);
  });

  test("空白のみの q は無効化", async () => {
    await getPublishedSpacesPaginated({ q: "   " });
    const { where } = lastFindManyArg();
    expect(where["OR"]).toBeUndefined();
  });

  test("minCapacity は capacity: { gte: N }", async () => {
    await getPublishedSpacesPaginated({ minCapacity: 4 });
    const { where } = lastFindManyArg();
    expect(where["capacity"]).toEqual({ gte: 4 });
  });

  test("minCapacity=0 は無効化（空文字と同等）", async () => {
    await getPublishedSpacesPaginated({ minCapacity: 0 });
    const { where } = lastFindManyArg();
    expect(where["capacity"]).toBeUndefined();
  });

  test("facilities は名前ごとに array_contains の AND", async () => {
    await getPublishedSpacesPaginated({
      facilities: ["Wi-Fi", "プロジェクター"],
    });
    const { where } = lastFindManyArg();
    expect(where["AND"]).toEqual([
      { facilities: { array_contains: [{ name: "Wi-Fi" }] } },
      { facilities: { array_contains: [{ name: "プロジェクター" }] } },
    ]);
  });

  test("空 facilities 配列は AND を生成しない", async () => {
    await getPublishedSpacesPaginated({ facilities: [] });
    const { where } = lastFindManyArg();
    expect(where["AND"]).toBeUndefined();
  });

  test("sort=recommended は name asc（既定）", async () => {
    await getPublishedSpacesPaginated({ sort: "recommended" });
    expect(lastFindManyArg().orderBy).toEqual({ name: "asc" });
  });

  test("sort=capacity-asc / -desc", async () => {
    await getPublishedSpacesPaginated({ sort: "capacity-asc" });
    expect(lastFindManyArg().orderBy).toEqual({ capacity: "asc" });
    resetAllMocks();
    await getPublishedSpacesPaginated({ sort: "capacity-desc" });
    expect(lastFindManyArg().orderBy).toEqual({ capacity: "desc" });
  });

  test("sort=price-asc / -desc は hourlyPrice", async () => {
    await getPublishedSpacesPaginated({ sort: "price-asc" });
    expect(lastFindManyArg().orderBy).toEqual({ hourlyPrice: "asc" });
    resetAllMocks();
    await getPublishedSpacesPaginated({ sort: "price-desc" });
    expect(lastFindManyArg().orderBy).toEqual({ hourlyPrice: "desc" });
  });

  test("page + perPage で skip/take が正しく計算される", async () => {
    await getPublishedSpacesPaginated({ page: 3, perPage: 5 });
    const { skip, take } = lastFindManyArg();
    expect(skip).toBe(10);
    expect(take).toBe(5);
  });
});

describe("getPublishedSpacesPaginatedWithAvailability", () => {
  beforeEach(resetAllMocks);

  test("Reservation + EventTimeSlot の busy id を where.id.notIn に足す", async () => {
    reservationFindMany.mockResolvedValue([{ spaceId: "s1" }]);
    eventTimeSlotFindMany.mockResolvedValue([
      { event: { spaceId: "s2" } },
      { event: { spaceId: null } },
    ]);

    const from = new Date("2026-07-20T01:00:00.000Z");
    const to = new Date("2026-07-20T03:00:00.000Z");
    await getPublishedSpacesPaginatedWithAvailability({}, { from, to });

    expect(reservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: { in: ["PENDING", "CONFIRMED"] },
          startTime: { lt: to },
          endTime: { gt: from },
        }),
      }),
    );

    expect(eventTimeSlotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event: expect.objectContaining({
            status: "PUBLISHED",
            deletedAt: null,
          }),
          startAt: { lt: to },
          endAt: { gt: from },
        }),
      }),
    );

    const { where } = lastFindManyArg();
    const idFilter = where["id"] as { notIn: string[] };
    expect(idFilter.notIn).toEqual(expect.arrayContaining(["s1", "s2"]));
    expect(idFilter.notIn).toHaveLength(2);
  });

  test("busy が 0 件なら where.id は追加されない", async () => {
    reservationFindMany.mockResolvedValue([]);
    eventTimeSlotFindMany.mockResolvedValue([]);

    const from = new Date("2026-07-20T01:00:00.000Z");
    const to = new Date("2026-07-20T03:00:00.000Z");
    await getPublishedSpacesPaginatedWithAvailability(
      { categoryId: "c1" },
      { from, to },
    );

    const { where } = lastFindManyArg();
    expect(where["id"]).toBeUndefined();
    expect(where["categoryId"]).toBe("c1");
  });
});

describe("getPublicSpaceFacilityNames", () => {
  beforeEach(resetAllMocks);

  test("重複除去 + ja ロケール順ソート", async () => {
    spaceFindMany.mockResolvedValue([
      {
        facilities: [
          { name: "Wi-Fi", iconName: "wifi" },
          { name: "プロジェクター", iconName: "projector" },
        ],
      },
      {
        facilities: [
          { name: "Wi-Fi", iconName: "wifi" },
          { name: "ホワイトボード", iconName: "board" },
        ],
      },
    ]);

    const names = await getPublicSpaceFacilityNames();
    expect(names).toHaveLength(3);
    expect(new Set(names)).toEqual(
      new Set(["Wi-Fi", "プロジェクター", "ホワイトボード"]),
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ja")));
  });

  test("facility 無しの空 DB 状態で空配列", async () => {
    spaceFindMany.mockResolvedValue([]);
    const names = await getPublicSpaceFacilityNames();
    expect(names).toEqual([]);
  });
});
