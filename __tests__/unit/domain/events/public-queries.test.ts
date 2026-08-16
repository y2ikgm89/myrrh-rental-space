import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../mocks/errors-server";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const eventFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const eventCount = mock<(_args?: unknown) => Promise<number>>(() =>
  Promise.resolve(0),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findMany: (args: unknown) => eventFindMany(args),
      count: (args: unknown) => eventCount(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
await installErrorsServerMock({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
});

const { getPublishedEvents, getPublishedEventsPaginated } =
  await import("@/shared/domain/events/public-queries");
const { CACHE_TAGS } = await import("@/shared/lib/constants");

function resetAllMocks() {
  eventFindMany.mockReset();
  eventCount.mockReset();
  eventFindMany.mockResolvedValue([]);
  eventCount.mockResolvedValue(0);
  cacheTagMock.mockReset();
  cacheLifeMock.mockReset();
}

interface FindManyCall {
  readonly where?: Record<string, unknown>;
  readonly orderBy?: Record<string, unknown>;
  readonly skip?: number;
  readonly take?: number;
}

function lastFindManyArg(): FindManyCall {
  const call = eventFindMany.mock.calls[0]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error("event.findMany was not called");
  }
  return call as FindManyCall;
}

describe("getPublishedEventsPaginated where clause", () => {
  beforeEach(resetAllMocks);

  test("tab=upcoming は status=PUBLISHED + deletedAt:null + slots.some(endAt>=now)", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where).toMatchObject({ status: "PUBLISHED", deletedAt: null });
    expect(where?.["slots"]).toEqual({
      some: { endAt: { gte: expect.any(Date) } },
    });
  });

  test("tab=past は slots.some(endAt>=now) を NOT で除外", async () => {
    await getPublishedEventsPaginated({
      tab: "past",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["NOT"]).toEqual({
      slots: { some: { endAt: { gte: expect.any(Date) } } },
    });
  });

  test("q はタイトル ILIKE", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "ヨガ",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["title"]).toEqual({ contains: "ヨガ", mode: "insensitive" });
  });

  test("空白のみの q は無効化", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "   ",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["title"]).toBeUndefined();
  });

  test("categoryId が where に足される", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: "c1",
    });
    const { where } = lastFindManyArg();
    expect(where?.["categoryId"]).toBe("c1");
  });

  test("categoryId=null は絞り込みなし", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["categoryId"]).toBeUndefined();
  });

  test("tab=upcoming の orderBy は firstSlotStartAt asc", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    expect(lastFindManyArg().orderBy).toEqual({
      firstSlotStartAt: { sort: "asc", nulls: "last" },
    });
  });

  test("tab=past の orderBy は lastSlotEndAt desc", async () => {
    await getPublishedEventsPaginated({ tab: "past", q: "", categoryId: null });
    expect(lastFindManyArg().orderBy).toEqual({
      lastSlotEndAt: { sort: "desc", nulls: "last" },
    });
  });

  test("page + perPage で skip/take が正しく計算される", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
      page: 3,
      perPage: 5,
    });
    const { skip, take } = lastFindManyArg();
    expect(skip).toBe(10);
    expect(take).toBe(5);
  });
});

describe("getPublishedEvents cacheTag contract", () => {
  beforeEach(resetAllMocks);

  test("calls cacheTag with EVENTS, LOCATIONS, and SPACES", async () => {
    await getPublishedEvents();
    expect(cacheTagMock).toHaveBeenCalledWith(
      CACHE_TAGS.EVENTS,
      CACHE_TAGS.LOCATIONS,
      CACHE_TAGS.SPACES,
    );
  });
});
