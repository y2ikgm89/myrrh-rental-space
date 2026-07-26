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
const spaceFindUnique = mock<(_args?: unknown) => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const reservationFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const eventTimeSlotFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(
  () => Promise.resolve([]),
);
const settingsOrganizationFindUnique = mock<
  (_args?: unknown) => Promise<unknown>
>(() => Promise.resolve(null));
const blockedDateFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: (args: unknown) => spaceFindMany(args),
      count: (args: unknown) => spaceCount(args),
      findUnique: (args: unknown) => spaceFindUnique(args),
    },
    reservation: {
      findMany: (args: unknown) => reservationFindMany(args),
    },
    eventTimeSlot: {
      findMany: (args: unknown) => eventTimeSlotFindMany(args),
    },
    settingsOrganization: {
      findUnique: (args: unknown) => settingsOrganizationFindUnique(args),
    },
    blockedDate: {
      findMany: (args: unknown) => blockedDateFindMany(args),
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
  isPublicSpaceAccessible,
} = await import("@/shared/domain/spaces/public-queries");

function resetAllMocks() {
  spaceFindMany.mockReset();
  spaceCount.mockReset();
  spaceFindUnique.mockReset();
  reservationFindMany.mockReset();
  eventTimeSlotFindMany.mockReset();
  settingsOrganizationFindUnique.mockReset();
  blockedDateFindMany.mockReset();
  spaceFindMany.mockResolvedValue([]);
  spaceCount.mockResolvedValue(0);
  spaceFindUnique.mockResolvedValue(null);
  reservationFindMany.mockResolvedValue([]);
  eventTimeSlotFindMany.mockResolvedValue([]);
  settingsOrganizationFindUnique.mockResolvedValue(null);
  blockedDateFindMany.mockResolvedValue([]);
}

interface FindManyCall {
  readonly where?: { readonly id?: { notIn?: string[]; in?: string[] } };
  readonly select?: Record<string, unknown>;
  readonly orderBy?: unknown;
  readonly skip?: number;
  readonly take?: number;
}

function spaceFindManyCalls(): FindManyCall[] {
  return spaceFindMany.mock.calls.map((c) => c[0] as FindManyCall);
}

/** candidates クエリ（id + locationId のみ select、ページネーション前の全件） */
function candidatesCall(): FindManyCall | undefined {
  return spaceFindManyCalls().find(
    (c) => c.select && "locationId" in c.select && !("slug" in c.select),
  );
}

function availableDisplayCall(): FindManyCall | undefined {
  return spaceFindManyCalls().find((c) => c.where?.id?.notIn !== undefined);
}

function unavailableDisplayCall(): FindManyCall | undefined {
  return spaceFindManyCalls().find((c) => c.where?.id?.in !== undefined);
}

function makeSpaceRow(id: string) {
  return {
    id,
    slug: id,
    name: id,
    descriptionPlainText: "",
    capacity: 10,
    area: null,
    hourlyPrice: 1000,
    mainImageUrl: "https://example.com/img.jpg",
    gallery: [],
    facilities: [],
    addressDetail: null,
    reviewsEnabled: false,
    category: null,
    location: { name: "L", address: "Addr" },
  };
}

interface CatalogItemWithAvailability {
  readonly id: string;
  readonly isAvailableForSearch: boolean;
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

  const OPEN_WINDOW = {
    date: "2026-07-27",
    startTime: "14:00",
    endTime: "16:00",
  };
  const CLOSED_ALL_WEEK = {
    monday: { isOpen: false, slots: [] },
    tuesday: { isOpen: false, slots: [] },
    wednesday: { isOpen: false, slots: [] },
    thursday: { isOpen: false, slots: [] },
    friday: { isOpen: false, slots: [] },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
  };

  test("営業時間外なら reservation/event/blockedDate を問い合わせず全件 isAvailableForSearch=false", async () => {
    settingsOrganizationFindUnique.mockResolvedValue({
      businessHours: CLOSED_ALL_WEEK,
    });
    spaceFindMany.mockResolvedValue([makeSpaceRow("s1"), makeSpaceRow("s2")]);
    spaceCount.mockResolvedValue(2);

    const from = new Date("2026-07-27T05:00:00.000Z");
    const to = new Date("2026-07-27T07:00:00.000Z");
    const result = await getPublishedSpacesPaginatedWithAvailability(
      {},
      { ...OPEN_WINDOW, from, to },
    );

    expect(reservationFindMany).not.toHaveBeenCalled();
    expect(eventTimeSlotFindMany).not.toHaveBeenCalled();
    expect(blockedDateFindMany).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(2);
    const items = result.items as unknown as CatalogItemWithAvailability[];
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.isAvailableForSearch === false)).toBe(true);
  });

  test("営業時間内: reservation + event + blockedDate の busy を合算し、空きありを先に並べる", async () => {
    // settingsFindUnique は既定 null（DEFAULT_BUSINESS_HOURS 9-21 にフォールバック）。
    // OPEN_WINDOW（14:00-16:00）はこの範囲内なので営業時間チェックは通過する。
    reservationFindMany.mockResolvedValue([{ spaceId: "s1" }]);
    eventTimeSlotFindMany.mockResolvedValue([{ event: { spaceId: "s2" } }]);
    blockedDateFindMany.mockResolvedValue([
      { scope: "SPACE", locationId: null, spaceId: "s3" },
    ]);

    spaceFindMany.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.select && "locationId" in args.select) {
        return [
          { id: "s1", locationId: "l1" },
          { id: "s2", locationId: "l1" },
          { id: "s3", locationId: "l1" },
          { id: "s4", locationId: "l1" },
          { id: "s5", locationId: "l1" },
        ];
      }
      if (args.where?.id?.notIn !== undefined) {
        return [makeSpaceRow("s4"), makeSpaceRow("s5")];
      }
      if (args.where?.id?.in !== undefined) {
        return [makeSpaceRow("s1"), makeSpaceRow("s2"), makeSpaceRow("s3")];
      }
      return [];
    });
    spaceCount.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.where?.id?.notIn !== undefined) return 2; // s4, s5
      if (args.where?.id?.in !== undefined) return 3; // s1, s2, s3
      return 0;
    });

    const from = new Date("2026-07-27T05:00:00.000Z");
    const to = new Date("2026-07-27T07:00:00.000Z");
    const result = await getPublishedSpacesPaginatedWithAvailability(
      {},
      { ...OPEN_WINDOW, from, to },
    );

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
            status: { in: ["DRAFT", "PUBLISHED"] },
            deletedAt: null,
          }),
          startAt: { lt: to },
          endAt: { gt: from },
        }),
      }),
    );
    expect(blockedDateFindMany).toHaveBeenCalled();

    const availableArgs = availableDisplayCall();
    const unavailableArgs = unavailableDisplayCall();
    expect(availableArgs?.where?.id?.notIn).toEqual(
      expect.arrayContaining(["s1", "s2", "s3"]),
    );
    expect(availableArgs?.where?.id?.notIn).toHaveLength(3);
    expect(unavailableArgs?.where?.id?.in).toEqual(
      expect.arrayContaining(["s1", "s2", "s3"]),
    );

    expect(result.totalCount).toBe(5);
    const items = result.items as unknown as CatalogItemWithAvailability[];
    expect(items).toHaveLength(5);
    // 空きあり (s4, s5) が先、空きなし (s1, s2, s3) が後
    expect(
      items
        .slice(0, 2)
        .map((i) => i.id)
        .sort(),
    ).toEqual(["s4", "s5"]);
    expect(items.slice(0, 2).every((i) => i.isAvailableForSearch)).toBe(true);
    expect(items.slice(2).every((i) => i.isAvailableForSearch === false)).toBe(
      true,
    );
  });

  test("ページネーション: skip が空きありグループを超える場合は空きなしグループから取得する", async () => {
    spaceFindMany.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.select && "locationId" in args.select) {
        return [
          { id: "a1", locationId: "l1" },
          { id: "b1", locationId: "l1" },
          { id: "b2", locationId: "l1" },
        ];
      }
      if (args.where?.id?.notIn !== undefined) return [];
      if (args.where?.id?.in !== undefined) {
        // skip=1, take=2 相当が unavailable 側に渡ることを検証
        expect(args.skip).toBe(0);
        expect(args.take).toBe(1);
        return [makeSpaceRow("b1")];
      }
      return [];
    });
    spaceCount.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.where?.id?.notIn !== undefined) return 1; // a1
      if (args.where?.id?.in !== undefined) return 2; // b1, b2
      return 0;
    });
    reservationFindMany.mockResolvedValue([
      { spaceId: "b1" },
      { spaceId: "b2" },
    ]);

    const from = new Date("2026-07-27T05:00:00.000Z");
    const to = new Date("2026-07-27T07:00:00.000Z");
    // perPage=1, page=2 → skip=1。available (1件) を超えるため unavailable 側の skip=0,take=1 になる。
    const result = await getPublishedSpacesPaginatedWithAvailability(
      { page: 2, perPage: 1 },
      { ...OPEN_WINDOW, from, to },
    );

    expect(result.totalCount).toBe(3);
    const items = result.items as unknown as CatalogItemWithAvailability[];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("b1");
    expect(items[0]?.isAvailableForSearch).toBe(false);
  });

  test("candidates が 0 件（facet 該当スペースなし）でもエラーにならず空結果を返す", async () => {
    spaceFindMany.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.select && "locationId" in args.select) {
        return []; // candidates: facet に該当するスペースなし
      }
      return [];
    });
    spaceCount.mockResolvedValue(0);

    const from = new Date("2026-07-27T05:00:00.000Z");
    const to = new Date("2026-07-27T07:00:00.000Z");
    const result = await getPublishedSpacesPaginatedWithAvailability(
      { categoryId: "no-match" },
      { ...OPEN_WINDOW, from, to },
    );

    // getBlockedSpaceIdsForDate は spaces=[] で DB に問い合わせず短絡するはず
    expect(blockedDateFindMany).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(0);
    expect(result.currentPage).toBe(1);
  });

  test("BlockedDate が GLOBAL scope なら候補全件が unavailable になる", async () => {
    spaceFindMany.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.select && "locationId" in args.select) {
        return [
          { id: "s1", locationId: "l1" },
          { id: "s2", locationId: "l2" },
        ];
      }
      if (args.where?.id?.in !== undefined) {
        return [makeSpaceRow("s1"), makeSpaceRow("s2")];
      }
      return [];
    });
    spaceCount.mockImplementation(async (rawArgs?: unknown) => {
      const args = rawArgs as FindManyCall;
      if (args.where?.id?.notIn !== undefined) return 0;
      if (args.where?.id?.in !== undefined) return 2;
      return 0;
    });
    blockedDateFindMany.mockResolvedValue([
      { scope: "GLOBAL", locationId: null, spaceId: null },
    ]);

    const from = new Date("2026-07-27T05:00:00.000Z");
    const to = new Date("2026-07-27T07:00:00.000Z");
    const result = await getPublishedSpacesPaginatedWithAvailability(
      {},
      { ...OPEN_WINDOW, from, to },
    );

    const items = result.items as unknown as CatalogItemWithAvailability[];
    expect(items.every((i) => i.isAvailableForSearch === false)).toBe(true);
    expect(candidatesCall()).toBeDefined();
  });
});

describe("isPublicSpaceAccessible", () => {
  beforeEach(resetAllMocks);

  test("isPublished && isActive のとき true", async () => {
    spaceFindUnique.mockResolvedValue({ isPublished: true, isActive: true });
    await expect(isPublicSpaceAccessible("space-1")).resolves.toBe(true);
  });

  test("非公開または非アクティブのとき false", async () => {
    spaceFindUnique.mockResolvedValue({ isPublished: false, isActive: true });
    await expect(isPublicSpaceAccessible("space-1")).resolves.toBe(false);

    spaceFindUnique.mockResolvedValue({ isPublished: true, isActive: false });
    await expect(isPublicSpaceAccessible("space-2")).resolves.toBe(false);
  });

  test("存在しないスペースは false", async () => {
    spaceFindUnique.mockResolvedValue(null);
    await expect(isPublicSpaceAccessible("missing")).resolves.toBe(false);
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
